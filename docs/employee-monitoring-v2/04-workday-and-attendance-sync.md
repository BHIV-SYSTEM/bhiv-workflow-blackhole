# Niyantran Employee Monitoring V2 — Workday & Attendance Synchronization

**Document ID:** NEM-V2-DOC-04  
**Version:** 2.0.0-PROD  
**Classification:** Business Logic & Lifecycle Integration Specification  
**System Working Directory:** `g:\Blackhole\Niyantran`  

---

## 1. Unified Workday & Monitoring Lifecycle

A critical innovation of Niyantran Employee Monitoring V2 is the architectural unification of HR attendance tracking with active monitoring session leases, while rigorously maintaining domain decoupling. In legacy enterprise systems, if a monitoring agent crashes, is uninstalled, or loses Wi-Fi connectivity, the employee's workday attendance is frequently aborted, marked absent, or subjected to automated salary penalties.

Niyantran V2 establishes an event-driven, decoupled synchronization model:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                     UNIFIED WORKDAY & ATTENDANCE LIFECYCLE                       │
│                                                                                  │
│   [Employee Clicks "Start Day"]                                                  │
│               │                                                                  │
│               ▼                                                                  │
│   ┌──────────────────────────────────────────────┐                               │
│   │ Enhanced Start Day Dialog                    │                               │
│   │ - Select Location (Office / Remote / WFH)    │                               │
│   │ - View Transparent Privacy Disclosures       │                               │
│   │ - Explicit Consent Toggle: [x] Enable Mon    │                               │
│   └──────────────────────┬───────────────────────┘                               │
│                          │                                                       │
│            ┌─────────────┴─────────────┐                                         │
│            ▼                           ▼                                         │
│   [Consent Granted]           [Consent Withheld / Offline]                       │
│            │                           │                                         │
│            ▼                           ▼                                         │
│   ┌──────────────────────┐    ┌──────────────────────┐                           │
│   │ ATTENDANCE: Present  │    │ ATTENDANCE: Present  │                           │
│   │ MONITORING: Active   │    │ MONITORING:          │                           │
│   │ (60s Lease Issued)   │    │ Disconnected /       │                           │
│   └──────────┬───────────┘    │ Not Monitored        │                           │
│              │                └──────────────────────┘                           │
│              │ (30s Heartbeat)                                                   │
│              ▼                                                                   │
│   ┌──────────────────────┐                                                       │
│   │ Active Work Session  │ ◄───► [Take Break / Pause] ──► Monitoring Suspended   │
│   └──────────┬───────────┘                                                       │
│              │                                                                   │
│   [Employee Clicks "End Day"]                                                    │
│              │                                                                   │
│              ▼                                                                   │
│   ┌──────────────────────────────────────────────┐                               │
│   │ Finalize Attendance & Revoke Leases          │                               │
│   │ - Drain & Flush Pending Telemetry Buffers    │                               │
│   │ - Compile Daily Activity Report (DAR)        │                               │
│   │ - Distinguish Attendance vs Monitored Hours  │                               │
│   └──────────────────────────────────────────────┘                               │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Explicit Monitoring Authorization Dialog

Workplace monitoring is never started covertly or without employee knowledge. When an employee logs in and initiates their workday, the frontend client presents the **Enhanced Start Day Dialog** (`client/src/pages/EnhancedStartDayDialog.jsx`):

### 2.1 UX Elements & Privacy Disclosures

1. **Work Location Selection**:
   - `Office`: Validates office network IP or office coordinates (`19.160122, 72.839720`).
   - `Work From Home / Remote`: Enables home location tracking without requiring corporate network LAN binding.
2. **Transparent Privacy Disclosure Card**:
   - Explicitly informs the employee what is monitored:
     - Foreground application executable name (e.g. `code.exe`, `chrome.exe`).
     - Application category (Development, Documentation, Communication, Neutral).
     - Non-sensitive aggregate numeric counts (key presses, mouse activity deltas).
     - Elapsed hardware idle time.
   - Explicitly confirms what is **NEVER** monitored:
     - 🚫 Zero keystroke text, typed characters, or passwords.
     - 🚫 Zero screen captures, video recording, or display snapshots.
     - 🚫 Zero Optical Character Recognition (OCR).
     - 🚫 Zero web browser URLs or web browsing history.
     - 🚫 Zero window titles, tab titles, or document names.
     - 🚫 Zero personal file or folder inspection.
3. **Explicit Monitoring Consent Toggle**:
   - The employee explicitly checks or leaves unchecked:
     `[✓] I understand and authorize work telemetry for this session.`
   - Consent state is submitted via `monitoringConsent: Boolean` in `POST /api/attendance/start-day/:userId`.

---

## 3. Decoupled Attendance & "Disconnected / Not Monitored" State

Niyantran V2 guarantees that an employee's HR attendance record (`Attendance`, `DailyAttendance`) remains 100% valid even if telemetry collection is not active:

### 3.1 State Resolution Matrix

| Scenario | HR Attendance (`isPresent`) | Monitoring Lease (`state`) | UI Badge Text | UI Visual Style |
| :--- | :---: | :---: | :--- | :--- |
| **Normal Authorized Work** | `true` | `ACTIVE` | `Active Monitoring` | Emerald Green Badge |
| **Agent Offline / Consent Denied** | `true` | `null` / `EXPIRED` | `Disconnected / Not Monitored`| Slate Grey Badge |
| **Authorized Lunch / Rest Break**| `true` | `PAUSED` | `On Break` | Amber Yellow Badge |
| **Workday Completed (End Day)** | `true` (if worked) | `COMPLETED` | `Day Completed` | Indigo Blue Badge |

### 3.2 Attendance Invariant

Under no circumstances does an agent crash or lease expiration clear `isPresent: true` or deduct payroll hours. The UI truthfully displays `Disconnected / Not Monitored`, maintaining transparent accountability for both management and employees.

---

## 4. Renewable 60-Second Lease State Machine

Telemetry collection is governed by short-lived cryptographic leases managed by `server/modules/employee-monitoring-v2/services/sessionService.js`:

```javascript
// Session Lease Issuance & Renewal
const leaseExpiresAt = new Date(Date.now() + 60 * 1000); // 60 seconds
session.lease_expires_at = leaseExpiresAt;
session.state = SESSION_STATES.ACTIVE;
await session.save();
```

### 4.1 State Machine Lifecycle Rules

1. **Cadence**: Every 30 seconds, the agent invokes `POST /api/monitoring-v2/sessions/:sessionId/renew-lease`.
2. **Grace Window**: If a renewal packet is delayed (e.g. transient Wi-Fi packet loss), the server provides a 30-second grace window beyond `lease_expires_at` (total 90s offline collection).
3. **Autonomous Timeout**: If no renewal arrives within 90 seconds, the agent autonomously halts live transmission and enqueues samples to its local signed buffer.
4. **Revocation**: Upon `POST /api/attendance/end-day/:userId`, active leases are immediately revoked (`state: 'COMPLETED'`), terminating all telemetry collection.

---

## 5. End Day Finalization & Automated Daily Activity Report

When an employee completes their shift and clicks **End Day**, the system triggers a coordinated, multi-step finalization protocol:

### 5.1 End Day Execution Sequence

1. **Mandatory Progress Validation**: The employee must have submitted their daily progress update in the Progress tab. If empty, End Day is prevented with `PROGRESS_NOT_SET` to ensure transparent daily reporting.
2. **Attendance Finalization**: `attendanceRecord.endDayTime = new Date()`, total working hours and overtime hours are calculated and stored.
3. **Lease Revocation**: `sessionService.endSession(sessionId, employeeId)` revokes the active monitoring lease, setting `state = 'COMPLETED'` and recording `ended_at`.
4. **Agent Buffer Drain & Flush**: The desktop agent receives an `END_DAY` Socket.io event and drains any pending buffered 1-minute telemetry packets to the server.
5. **Daily Activity Report Compilation**: The server automatically aggregates all telemetry slices for the day into an immutable `DailyActivityReport` (`DailyAttendance.dailyReport`).

### 5.2 Daily Activity Report Metrics Schema

The generated report rigorously distinguishes authentic attendance time from monitored active time:

```json
{
  "reportDate": "2026-11-21",
  "employeeId": "6b003575d7d9211bd68333ab",
  "employeeName": "Ishan (Team Member)",
  "metrics": {
    "totalAttendanceHours": 8.5,
    "monitoredHours": 7.8,
    "activeInputHours": 6.4,
    "hardwareIdleHours": 1.4,
    "breakHours": 0.7,
    "averageFocusScore": 92
  },
  "categoryDistribution": {
    "DEVELOPMENT": { "minutes": 280, "percentage": 59.8 },
    "DOCUMENTATION": { "minutes": 110, "percentage": 23.5 },
    "COMMUNICATION": { "minutes": 60, "percentage": 12.8 },
    "SUPPORT": { "minutes": 18, "percentage": 3.9 },
    "NEUTRAL": { "minutes": 0, "percentage": 0.0 }
  },
  "topApplications": [
    { "executable": "code.exe", "minutes": 280, "category": "DEVELOPMENT" },
    { "executable": "chrome.exe", "minutes": 110, "category": "DOCUMENTATION" },
    { "executable": "slack.exe", "minutes": 60, "category": "COMMUNICATION" }
  ],
  "monitoringCompliance": "Compliant (Authorized)",
  "generatedAt": "2026-11-21T18:00:00.000Z"
}
```

This report is saved directly in MongoDB and made available for employee download and administrative analytics.
