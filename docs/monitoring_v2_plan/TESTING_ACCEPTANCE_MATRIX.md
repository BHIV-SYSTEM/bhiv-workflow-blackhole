# Employee Monitoring V2: Testing & Production Acceptance Matrix

**Document ID:** `TEST-MATRIX-009`  
**Classification:** Quality Assurance & Acceptance Specification  
**Date:** November 2026  
**Status:** COMPLETE  
**Scope:** Production Readiness Verification across 14 Critical Operational Scenarios  

---

## 1. Testing Framework & Methodology

The Niyantran Employee Monitoring V2 verification strategy encompasses four testing tiers:
1. **Unit Testing (Jest / Vitest / Cargo Test):** Verification of metric aggregation, time window math, lease expiration calculations, and HMAC signing logic.
2. **Integration Testing (Supertest / MongoDB Memory Server):** Verification of REST routes, lease transition state machines, and sequence deduplication.
3. **End-to-End Testing (Playwright & Electron Automation):** Full-lifecycle testing from employee login on mobile to desktop agent tracking and admin dashboard live updates.
4. **Security, Privacy & Performance Audits:** Memory leak profiling, battery consumption tests, and automated regex verification confirming zero raw keystrokes or private URLs exist in the database.

---

## 2. The 14-Point Production Readiness Acceptance Matrix

| # | Scenario / Test Focus | Preconditions | Test Procedure / Execution Steps | Expected Result & Verification Criteria | Pass/Fail Criteria | Severity |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| **01** | **Browser Tab Switching & Browser Closure** | Employee logged into Niyantran web; Desktop Agent running. | 1. Start Day.<br>2. Switch Niyantran tab to Google.<br>3. Close Chrome browser completely.<br>4. Continue working in VS Code for 30 minutes. | Desktop Agent continues streaming telemetry unaffected. Admin dashboard shows employee as `ACTIVE / FOCUSED_WORK`. Zero false idle flags generated. | Browser closure must cause 0% interruption to active desktop session. | **CRITICAL** |
| **02** | **Heavy IDE, Terminal & CAD Work** | Desktop Agent active on Windows/macOS. | 1. Open VS Code and write code for 15 minutes.<br>2. Open Terminal and run Docker builds.<br>3. Read technical documentation in browser. | Process correctly classified as `DEVELOPMENT` and `DOCUMENTATION`. Key counts and mouse deltas recorded. Productivity score remains > 85%. | Productive work outside Niyantran is never flagged as idle. | **CRITICAL** |
| **03** | **Phone Login & Desktop Handoff** | Active session on Laptop (Device A). | 1. Open Niyantran on mobile browser.<br>2. Click "Switch Device".<br>3. Authenticate and select "Phone Mode". | Server revokes Device A lease. Device A tray halts monitoring and displays notification. Phone displays "Mobile Workflow Active". No duplicate sessions. | Zero double-counting; seamless transfer without attendance reset. | **HIGH** |
| **04** | **Agent Crash & Auto-Recovery** | Desktop Agent active. | 1. Force kill `niyantran-agent.exe` via Task Manager.<br>2. Relaunch agent after 20 seconds. | Agent detects existing active session in MongoDB, re-authenticates with `DeviceToken`, and resumes telemetry streaming without prompt. | Session state recovered seamlessly within 30 seconds. | **HIGH** |
| **05** | **Internet Outage & Encrypted Buffer Sync** | Desktop Agent active. | 1. Disconnect Wi-Fi / Ethernet for 15 minutes.<br>2. Continue typing and working.<br>3. Reconnect Wi-Fi. | Agent writes samples to local AES-256-GCM buffer. Upon reconnect, flushes `/ingest/sync-offline`. Server marks timeline with `OFFLINE_SYNCED`. Zero data loss. | All 15 minutes of offline work restored accurately without dropped intervals. | **CRITICAL** |
| **06** | **OS Lock, Sleep & System Wake** | Laptop on battery power, active session. | 1. Lock screen (Win+L / Cmd+Ctrl+Q) for 10 min.<br>2. Close laptop lid (Sleep) for 20 min.<br>3. Open lid and unlock. | PowerMonitor detects sleep; halts telemetry immediately. Server flags status as `AWAY / SLEEPING`. On wake, agent re-checks lease and resumes. | Zero phantom keystrokes or corrupted timestamps recorded during sleep. | **CRITICAL** |
| **07** | **Employee Explicit Pause & Resume** | Monitored session active. | 1. Click "Pause for Break" in tray.<br>2. Select "Lunch (30m)".<br>3. Browse personal sites for 15 minutes.<br>4. Click "Resume Work". | Agent halts all input hooks; transmits `SESSION_PAUSED`. Admin dashboard displays amber `PAUSED` pill. Timeline explicitly tags period as `PAUSED`. | Zero personal activity tracked during paused break. | **HIGH** |
| **08** | **Personal Application Privacy Exclusions** | BYOD laptop, agent active. | 1. Open WhatsApp Desktop / Spotify / Netflix.<br>2. Type personal messages.<br>3. Inspect outgoing network payload in Wireshark / Proxyman. | Process classified strictly as `EXCLUDED_PERSONAL`. Window title is redacted to `[Private Content]`. Keystroke counts are suppressed (0 keys sent). | Verifiable zero leaks of personal chat or sensitive window titles. | **CRITICAL** |
| **09** | **Duplicate Session Collision Prevention** | Active session on Laptop A. | 1. Launch Agent on Laptop B with same credentials.<br>2. Attempt to start monitored session without handoff. | Server rejects Laptop B with `409 DUPLICATE_MONITORING_REJECTED`. Laptop A lease is undisturbed. Security event logged to `device_audit_logs`. | Strict single-device lease enforcement at all times. | **HIGH** |
| **10** | **Backend Infrastructure Outage** | 50 agents streaming telemetry. | 1. Stop backend Express server for 60 seconds.<br>2. Restart backend server. | Agents enter exponential backoff retry; buffer samples locally. Upon server restart, agents reconnect and flush buffers cleanly without 502/504 errors. | Server recovers gracefully without database connection pool exhaustion. | **HIGH** |
| **11** | **Desktop Resource & Battery Consumption** | Windows 11 & macOS Sonoma laptops. | 1. Run agent continuously for 8 hours on battery.<br>2. Profile with Windows Performance Monitor & Instruments. | RAM usage strictly < 150 MB (Electron) / < 35 MB (Tauri). CPU usage strictly < 0.5% average. Battery drain < 1% of total capacity over 8h. | Meets enterprise desktop lightweight performance standards. | **HIGH** |
| **12** | **Cross-Platform OS Compatibility** | Clean VMs: Win 10, Win 11, macOS 14 Sonoma, Ubuntu 22.04 LTS. | 1. Install agent on each OS.<br>2. Verify startup, system tray, hooks, and active window detection. | Windows: Win32 hooks work seamlessly.<br>macOS: Prompts for Input Monitoring; FrontmostApp works.<br>Linux: X11 hooks work seamlessly. | Consistent cross-platform behavior without platform-specific crashes. | **HIGH** |
| **13** | **Security & Authorization Failures** | Attacker attempting API access. | 1. Send forged telemetry without HMAC signature.<br>2. Send request with expired DeviceToken.<br>3. Send replayed request with duplicate nonce. | Ingest gateway rejects with `401 Unauthorized` and `403 Forbidden`. Replayed nonces dropped with `409 Conflict`. Audit logged. | Uncompromised API boundary security. | **CRITICAL** |
| **14** | **Dashboard Consistency & Scoring Accuracy** | Admin dashboard and Employee view open. | 1. Compare daily active time and productivity scores across Employee View, Admin Fleet, and Daily Reports. | Exact match across all views. Scoring formula applies task-based focus credit rather than raw typing speed. Reading/thinking credited fairly. | Single source of truth for telemetry metrics across all UI views. | **HIGH** |

---

## 3. Automated Privacy & Leak Verification Checklist

Before any code deployment to staging or production, the automated test suite must execute the following security assertions:

```javascript
describe('BYOD Privacy & Anti-Surveillance Verification', () => {
  it('MUST NOT store raw text in any database collection', async () => {
    const collections = ['aggregated_telemetry_v2', 'monitoring_sessions_v2', 'device_audit_logs'];
    for (const col of collections) {
      const docs = await mongoose.connection.collection(col).find({ text: { $exists: true } }).toArray();
      expect(docs.length).toBe(0);
    }
  });

  it('MUST NOT record personal window titles', async () => {
    const personalPatterns = [/whatsapp/i, /telegram/i, /bank/i, /password/i, /netflix/i];
    const telemetry = await AggregatedTelemetryV2.find({}).lean();
    for (const sample of telemetry) {
      for (const pattern of personalPatterns) {
        expect(pattern.test(sample.primary_category)).toBe(false);
      }
    }
  });

  it('MUST NOT contain screen capture payloads', async () => {
    const samples = await AggregatedTelemetryV2.find({ 
      $or: [{ image: { $exists: true } }, { screenshot: { $exists: true } }, { base64: { $exists: true } }] 
    });
    expect(samples.length).toBe(0);
  });
});
```

---

## 4. Sign-Off & Governance Protocol

Production release requires unconditioned sign-off from:
1. **Lead Software Architect:** Architecture, state machine, and data flow verification.
2. **Cybersecurity & Compliance Specialist:** GDPR / DPDP Act compliance, zero-keystroke verification, and secret storage sign-off.
3. **Engineering Lead (Desktop & Web):** Desktop agent stability, cross-platform packaging, and UI responsiveness sign-off.
