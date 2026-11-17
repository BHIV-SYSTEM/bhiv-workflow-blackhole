# Reliability, Fault Tolerance & Performance Engineering Plan

**Document ID:** `V2-DOC-12`  
**Classification:** Quality of Service (QoS) & Reliability Architecture  
**Target Subsystem:** `employee-agent-v2/` & `server/modules/employee-monitoring-v2/`  
**Date:** November 2026  
**Status:** DRAFT / PENDING APPROVAL  

---

## 1. Reliability Targets & Failure Mode Matrix

To ensure that technical glitches never lead to false idle penalties, lost work hours, or distorted analytics, Employee Monitoring V2 establishes strict reliability designs:

| Failure Scenario | Root Cause | V2 Resilience Mechanism | Guaranteed Outcome |
| :--- | :--- | :--- | :--- |
| **Desktop Agent Crash** | OS memory kill / unhandled native fault | Electron single-instance lock + OS auto-restart service | Agent recovers within 20s; re-acquires lease from server without losing active workday. |
| **Internet Disconnection** | Wi-Fi drop / flight travel | Local encrypted SQLite queue (AES-256-GCM) | Up to 83 minutes (500 samples) buffered on disk; flushes idempotently on reconnect. |
| **Backend Server Outage** | Server deploy / maintenance | Exponential backoff retry with jitter | Agents queue telemetry locally; server connection pool avoids exhaustion upon restart. |
| **System Sleep / Lid Closed**| Laptop sleep / transit | Electron `powerMonitor.on('suspend')` hook | Halts telemetry ticks immediately; server marks state `AWAY / SLEEP`; zero phantom idle time. |
| **OS Screen Lock** | Win+L / Cmd+Ctrl+Q | Electron `powerMonitor.on('lock-screen')` hook | Transitions state to `AWAY`; halts active input expectations until unlocked. |
| **System Clock Skew** | CMOS battery failure / unsynced NTP | Server measures `\|serverTime - clientTime\|` | Rejects if skew > 120s (`400 BAD_CLOCK_SKEW`); normalizes acceptable skew to server UTC. |
| **Antivirus / EDR Alert** | Shell spawning / raw keylogging | Zero PowerShell spawning; user-space binary | Operates cleanly as standard desktop productivity tray without triggering malware heuristics. |
| **Offline Buffer Overflow**| Disconnected for > 83 minutes | FIFO ring eviction with rolled-up summary | Oldest individual slices collapsed into an hourly presence bucket; zero crash or data corruption. |

---

## 2. Measurable Performance & Resource Budgets

```
┌─────────────────────────────────┬───────────────────────────────┬───────────────────────────────┐
│ Metric / Resource               │ V1 Legacy Measured Baseline   │ V2 Hardened Performance Budget│
├─────────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ **Idle Memory Footprint**       │ 160 MB – 220 MB RAM           │ **< 120 MB RAM** (Electron)   │
│ **Active Coding Memory**        │ 180 MB – 240 MB RAM           │ **< 145 MB RAM** (Electron)   │
│ **Active CPU Utilization**      │ 3.5% – 8.0% CPU (PowerShell)  │ **< 0.4% CPU** (Native C++)   │
│ **Daily Battery Drain (8h)**    │ ~4.5% – 6.0% laptop battery   │ **< 1.0%** total battery      │
│ **Network Payload Size**        │ ~8.5 KB per 5s (with text)    │ **< 1.2 KB** per 10s sample   │
│ **Hourly Network Bandwidth**    │ ~6.1 MB / hour                │ **< 430 KB / hour**           │
│ **Binary Disk Footprint**       │ ~180 MB (unpacked)            │ **~115 MB** (ASAR packaged)   │
└─────────────────────────────────┴───────────────────────────────┴───────────────────────────────┘
```

---

## 3. Backend Ingestion & Database Throughput Tuning

### A. High-Throughput Batch Processing
- Rather than inserting individual 10-second records as discrete MongoDB documents, the backend aggregates telemetry into **1-minute rolled-up slices** (`aggregated_telemetry_v2`).
- Database writes drop from 12 writes/minute per user down to **1 upsert/minute per user** (a 92% reduction in MongoDB write IOPS).
- Writes use MongoDB `$inc` operators:
  ```javascript
  await AggregatedTelemetryV2.updateOne(
    { employee: employeeId, minute_timestamp: minuteBucketStart },
    {
      $inc: {
        'activity_counts.key_presses': sample.keyPressCount,
        'activity_counts.mouse_events': sample.mouseActivityDelta,
        'activity_counts.scroll_events': sample.scrollDelta,
        'activity_counts.hardware_idle_seconds': sample.hardwareIdleSeconds
      },
      $set: {
        primary_category: resolvedCategory,
        focus_score: calculatedFocusScore,
        task_id: sample.taskId
      }
    },
    { upsert: true }
  );
  ```

### B. Rate Limiting & Circuit Breaking
- Ingestion Gateway enforces an IP and Device-level rate limit: maximum **12 requests per minute per device**.
- If a misconfigured client loops rapidly, it receives `429 Too Many Requests` with a `Retry-After: 10` header.
- Global circuit breaker: If MongoDB write latency exceeds 1,500ms, the gateway returns `202 Accepted (Queued)` and pushes samples to an in-memory Redis/bullmq worker to protect primary database stability.
