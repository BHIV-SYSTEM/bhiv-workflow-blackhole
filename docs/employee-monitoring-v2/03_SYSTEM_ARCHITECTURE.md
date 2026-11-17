# Employee Monitoring V2: System Architecture & Data Flow Specification

**Document ID:** `V2-DOC-03`  
**Classification:** Complete System Architecture Document (SAD)  
**Target Repository:** `Niyantran`  
**Date:** November 2026  
**Status:** UPDATED FOR PHASE A CORRECTIONS  

---

## 1. Architectural Topology & Tier Boundaries

Employee Monitoring V2 is architectured across five decoupled tiers to ensure scalability, fault isolation, strict privacy enforcement, and complete independence from legacy systems.

```mermaid
flowchart TD
    subgraph Tier1 [Tier 1: Client & Agent Tier]
        PhoneNode[A. Mobile Client\nMobile Browser / PWA\nPhone Mode: Non-Monitored]
        DesktopNode[B. Desktop Agent V2\nElectron Hardened / Native Tray\nLaptop/PC Mode: OS Telemetry]
        WebNode[C. Web UI SPA\nAdmin Console & Employee Workspace\nReact 18 / Tailwind / WebSocket]
    end

    subgraph Tier2 [Tier 2: Edge & Security Gateway]
        IngestGW[V2 Ingestion Gateway\nRate Limiting: 12 req/min\nClock Skew Verifier: < 120s]
        SecurityGuard[HMAC-SHA256 Verifier\nReplay Nonce Checker\nScoped Device Token Validator]
    end

    subgraph Tier3 [Tier 3: Service & State Machine Tier]
        DeviceService[Device Enrollment Service\nDevice Pairing, Public Secret Hash]
        SessionSM[Session Lease State Machine\n60s Lease / 10s Heartbeat / 30s Grace\nACTIVE, FOCUSED, IDLE, AWAY, PAUSED]
        TelemetryEngine[Telemetry Rollup Engine\n1-Minute Bucket Aggregation\nWork-App Categorization]
        AuditLedger[Tamper-Proof Audit Logger\nCryptographic Sequence Hash]
    end

    subgraph Tier4 [Tier 4: Persistence Tier - MongoDB]
        ColDevices[(monitoring_v2_devices)]
        ColSessions[(monitoring_v2_sessions)]
        ColTelemetry[(monitoring_v2_telemetry)]
        ColAudit[(monitoring_v2_audit_logs)]
        ColPreferences[(monitoring_v2_privacy_preferences)]
    end

    subgraph Tier5 [Tier 5: Read-Only Niyantran Ecosystem]
        AttCore[(Attendance / Workday Status\nREAD-ONLY CHECK ONLY)]
        TaskCore[(Tasks & Submissions)]
        AimCore[(Daily Aims & Progress)]
        ParikshakAI[Parikshak Review Engine]
    end

    PhoneNode -->|Attendance Verification| IngestGW
    DesktopNode -->|Encrypted Telemetry Batch / 10s| IngestGW
    WebNode -->|Admin Queries & Employee Controls| IngestGW

    IngestGW --> SecurityGuard
    SecurityGuard --> DeviceService
    SecurityGuard --> SessionSM
    
    SessionSM --> TelemetryEngine
    DeviceService --> AuditLedger
    
    DeviceService <--> ColDevices
    SessionSM <--> ColSessions
    TelemetryEngine <--> ColTelemetry
    AuditLedger --> ColAudit
    SessionSM <--> ColPreferences

    SessionSM -.->|Read-Only: Verify Active Day| AttCore
    TelemetryEngine -.->|Attribute Work to Task| TaskCore
    TelemetryEngine -.->|Correlate Daily Aims| AimCore
    ColTelemetry -.->|Verified Focus Evidence| ParikshakAI
```

---

## 2. Attendance Isolation & Non-Interference (Correction 5)

**Mandatory Rule:** Employee Monitoring V2 has **zero side effects on attendance records**.

Under no circumstances will V2:
- Automatically clock an employee in or out.
- Modify `Attendance` or `DailyAttendance` records.
- Alter `hoursWorked`, `breakTime`, `overtimeHours`, or presence flags.
- Trigger automatic salary, stipend, or productivity penalties.
- Alter existing attendance APIs or database schemas.

### The Read-Only Attendance Adapter (`attendanceAdapter.js`):
V2 defines an isolated read-only adapter interface. It queries attendance strictly to answer one question:
> *"Does this employee currently have an authorized open workday?"*

```javascript
// server/modules/employee-monitoring-v2/services/attendanceAdapter.js
// READ-ONLY ADAPTER - ZERO ATTENDANCE MUTATION
const Attendance = require('../../../models/Attendance');
const DailyAttendance = require('../../../models/DailyAttendance');

async function isWorkdayActive(userId) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeRecord = await Attendance.findOne({
      user: userId,
      date: { $gte: today },
      startDayTime: { $ne: null },
      $or: [{ endDayTime: null }, { endDayTime: { $exists: false } }]
    }).select('_id startDayTime').lean();

    return Boolean(activeRecord);
  } catch (error) {
    console.error('[V2 AttendanceAdapter] Read-only check failed:', error.message);
    return false;
  }
}
```

V2 session start/stop operations represent **monitoring work sessions**, completely decoupled from formal HR attendance.

---

## 3. Core Operational Pipelines

### Pipeline A: Online Real-Time Telemetry Pipeline (10s Cadence)
```mermaid
sequenceDiagram
    autonumber
    participant Host as Workstation OS
    participant Agent as Desktop Agent V2
    participant GW as Gateway (/api/monitoring-v2/ingest)
    participant SM as Session State Machine
    participant DB as MongoDB (monitoring_v2_telemetry)
    participant UI as Admin Live Console (WebSocket)

    Host->>Agent: Keyboard presses & Mouse deltas (Counts Only)
    Host->>Agent: Active Process Name & Idle Seconds
    Agent->>Agent: Discard personal apps; aggregate counters (10s window)
    Agent->>GW: POST /api/monitoring-v2/ingest (Batch + HMAC-SHA256 + Nonce)
    GW->>GW: Verify HMAC signature & monotonic sequence number
    GW->>SM: Verify Active Session Lease
    alt Lease Active & Valid
        GW->>DB: Upsert to 1-Minute Aggregation Bucket
        GW->>SM: Renew Lease Timestamp (lastSeenAt = now)
        GW-->>Agent: 200 OK (serverCommand: CONTINUE, leaseExpiresAt: now + 60s)
        GW->>UI: Emit WebSocket Update (live_telemetry_tick)
    else Lease Transferred or Expired
        GW-->>Agent: 409 CONFLICT (Session transferred to Device B)
        Agent->>Agent: Halt monitoring & display tray alert
    end
```

### Pipeline B: Offline Encrypted Buffering & Synchronization
```mermaid
sequenceDiagram
    autonumber
    participant Host as Workstation OS
    participant Agent as Desktop Agent V2
    participant Disk as Local Encrypted Queue (AES-256-GCM)
    participant GW as Gateway (/api/monitoring-v2/ingest/sync-offline)
    participant DB as MongoDB

    Note over Agent,GW: Network Disconnected (Flight / Internet Outage)
    loop Every 10 Seconds
        Host->>Agent: OS Input Counts & Idle State
        Agent->>Agent: Detects Offline State
        Agent->>Disk: Encrypt & Append Sample (Max 500 samples ~ 83 minutes)
    end
    Note over Agent,GW: Network Restored
    Agent->>GW: POST /api/monitoring-v2/ingest/sync-offline (Batch of up to 50 samples)
    GW->>GW: Validate Timestamps & Monotonic Nonces
    GW->>DB: Bulk Upsert Telemetry with sync_type: 'OFFLINE_BUFFERED'
    GW-->>Agent: 200 OK (Acknowledged Nonces [seq_101...seq_150])
    Agent->>Disk: Securely Purge Acknowledged Samples from Disk
```

### Pipeline C: Device Handoff Protocol (Mutual Exclusion)
```mermaid
sequenceDiagram
    autonumber
    actor Employee
    participant DevA as Origin Device A (PC)
    participant DevB as Destination Device B (Mac/Phone)
    participant Backend as Backend Session Router
    participant DB as MongoDB (monitoring_v2_sessions)

    Employee->>DevB: Initiates "Switch Device" in Employee Workspace
    DevB->>Backend: POST /api/monitoring-v2/sessions/switch (targetDeviceId, PIN)
    Backend->>Backend: Verify DevB Registration & Authorization
    Backend->>DB: Atomically Revoke DevA Lease; Grant DevB Lease
    Backend->>DB: Append Handoff Record to Session History
    Backend-->>DevB: 200 OK (Session Transferred; Start Tracking)
    
    DevA->>Backend: Regular 10s Heartbeat (POST /sessions/heartbeat)
    Backend-->>DevA: 409 CONFLICT (LEASE_REVOKED: Transferred to DevB)
    DevA->>DevA: Halt local input hooks; update tray status to "Transferred"
```
