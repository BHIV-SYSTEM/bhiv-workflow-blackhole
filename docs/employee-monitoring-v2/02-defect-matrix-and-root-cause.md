# Niyantran Employee Monitoring V2 — Defect Matrix & Root Cause Analysis

**Document ID:** NEM-V2-DOC-02  
**Version:** 2.0.0-PROD  
**Classification:** Engineering Audit & Defect Root-Cause Report  
**System Working Directory:** `g:\Blackhole\Niyantran`  

---

## 1. Executive Defect Audit Summary

During the initial engineering audit of the Niyantran repository across frontend, backend, and agent layers, significant architectural defects and legacy surveillance anti-patterns were uncovered. Prior iterations suffered from coupled failures where monitoring outages corrupted employee payroll attendance, hardcoded mock data masked broken database queries, invasive surveillance modules violated privacy regulations, and native Windows desktop interactions failed due to missing protocol bindings and improper Win32 API usage.

This document presents the complete, verified Root Cause Defect Matrix across all subsystems, detailing the original fault symptoms, root cause mechanics, remediation implementations, and verification evidence.

---

## 2. Comprehensive Defect Matrix

| Defect ID | Subsystem | Component | Root Cause Classification | Initial Severity | Remediated Status | Verification Tier |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: |
| **DEF-001** | Backend / Dist | Installer Endpoint | Missing Binary & Unauthenticated Route | **HIGH** | **RESOLVED** | Tier 1 (F1), Tier 4 (Test A) |
| **DEF-002** | Agent / OS | Desktop Lifecycle | Missing URI Protocol & Unbound Loopback | **HIGH** | **RESOLVED** | Tier 1 (F2, F3), Tier 4 (Test B) |
| **DEF-003** | Agent / Hardware| WMI Detection | Hardcoded "Generic PC" / Faulty CIM Filter | **MEDIUM** | **RESOLVED** | Tier 1 (F4), Tier 4 (Test A, B) |
| **DEF-004** | Agent / Native | Win32 Helper | Invasive `GetWindowText` Hook in Helper | **CRITICAL** | **RESOLVED** | Tier 1 (F5, F7), Tier 4 (Test D) |
| **DEF-005** | Backend / DB | Surveillance Code | Legacy Keystroke, Screenshot, OCR & Karma | **CRITICAL** | **RESOLVED** | Tier 1 (F7), Tier 2 (F7), Tier 4 (Test D) |
| **DEF-006** | Full-Stack | Workday Lifecycle| Coupled Monitoring & Attendance Failures | **HIGH** | **RESOLVED** | Tier 1 (F10, F11), Tier 4 (Test C) |
| **DEF-007** | Backend / Schema| Mongoose Schema | Enum Value Mismatch (`ACTIVE_MONITORING`) | **HIGH** | **RESOLVED** | Tier 4 (Scen 8, Scen 9), Tier 5 |
| **DEF-008** | Backend / Logic | Attendance Route| Unnormalized Timestamp in Date Lookup | **HIGH** | **RESOLVED** | Tier 1 (F13), Tier 5 (Adversarial) |
| **DEF-009** | Frontend / Vite | Vite Config | Unhandled Socket.io Proxy WebSocket Upgrade | **HIGH** | **RESOLVED** | Tier 1 (F15), Tier 2 (F15) |
| **DEF-010** | Frontend / UI | Admin Console | Synthetic Mock Data Masking Broken API | **HIGH** | **RESOLVED** | Tier 1 (F14), Tier 4 (Test F) |

---

## 3. Deep-Dive Root Cause Investigations & Remediations

### 3.1 DEF-001: Installer Distribution Endpoint & SHA-256 Checksum Validation

#### Symptom
Clicking **Download Agent** on the authenticated employee dashboard produced a 404 Not Found error, and no binary payload was delivered to the client.

#### Root Cause
1. Route `/api/monitoring-v2/installer/download` was either missing or mapped to a non-existent build directory.
2. The installer packaging pipeline did not calculate or expose the SHA-256 cryptographic checksum of the compiled executable, preventing client-side integrity validation.

#### Remediation
- Created `server/modules/employee-monitoring-v2/routes/installer.js` mounting:
  - `GET /api/monitoring-v2/installer/info`: Serves `{ version, fileName, sha256, sizeBytes, available: true }`.
  - `GET /api/monitoring-v2/installer/download`: Authenticated stream serving `NiyantranMonitoringAgentV2-Setup.exe` with header `Content-Type: application/vnd.microsoft.portable-executable`.
- Checksum computed on-the-fly and cached in memory:
  ```javascript
  const fileBuffer = fs.readFileSync(installerPath);
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex').toUpperCase();
  ```

---

### 3.2 DEF-002: Desktop Agent Protocol Registration & Loopback Daemon Binding

#### Symptom
Clicking **Open Agent** in the web dashboard failed to bring the desktop agent to the foreground, showing an error dialog stating *"Agent unreachable on port 48120"*.

#### Root Cause
1. The agent installer did not register the `niyantran://` protocol scheme in the Windows Registry (`HKCU\Software\Classes\niyantran`).
2. The agent loopback HTTP server did not handle port collisions gracefully; if port 48120 was busy, the agent terminated instead of probing fallback ports.
3. CORS headers were missing, causing modern browsers to block `http://127.0.0.1:48120/status` probes.

#### Remediation
- Implemented Windows Registry protocol registration in installer script (`install-protocol.cmd`):
  ```cmd
  reg add "HKCU\Software\Classes\niyantran" /ve /t REG_SZ /d "URL:Niyantran Agent" /f
  reg add "HKCU\Software\Classes\niyantran" /v "URL Protocol" /t REG_SZ /d "" /f
  reg add "HKCU\Software\Classes\niyantran\shell\open\command" /ve /t REG_SZ /d "\"%~dp0NiyantranMonitoringAgentV2.exe\" \"%%1\"" /f
  ```
- Enhanced `employee-agent-v2/src/daemon.js` with loopback-only binding (`127.0.0.1`), robust CORS validation (`Access-Control-Allow-Origin: http://localhost:5173`), and automatic fallback port scanning (48120–48130).

---

### 3.3 DEF-003: Acer Hardware Detection via WMI/CIM Queries

#### Symptom
Desktop agent reported the host machine as a generic *"Windows PC"*, ignoring the actual physical machine profile.

#### Root Cause
Hardware queries relied on Node's generic `os.hostname()` and `os.platform()`, which do not query the Windows Management Instrumentation (WMI) subsystem.

#### Remediation
Integrated WMI/CIM querying in `employee-agent-v2/src/hardware/wmiDetector.js` executing PowerShell CIM commands:
```powershell
Get-CimInstance -ClassName Win32_ComputerSystem | Select-Object Manufacturer, Model
Get-CimInstance -ClassName Win32_ComputerSystemProduct | Select-Object IdentifyingNumber, UUID
```
Result on Acer development machine:
- **Manufacturer**: `Acer`
- **Model**: `Nitro AN515-57`
- **Machine UUID**: Captured and bound to `RegisteredDevice.machine_uuid`.

---

### 3.4 DEF-004: Invasive `GetWindowText` Hook in Native Win32 Helper

#### Symptom
Early audit iterations of `NiyantranWin32Helper.cs` captured the foreground window title via `GetWindowTextW`, exposing sensitive user data (e.g. document titles, web page names, patient/client records).

#### Root Cause
The legacy tracking implementation treated window titles as the primary method to classify applications, violating zero-surveillance requirements.

#### Remediation
- Systematically excised all references to `GetWindowText`, `GetWindowTextW`, and `SetWindowsHookEx(WH_KEYBOARD_LL)`.
- Replaced window inspection with `QueryFullProcessImageName`:
  ```csharp
  // Query only executable image path
  if (QueryFullProcessImageName(hProcess, 0, sb, ref capacity)) {
      string exeName = Path.GetFileName(sb.ToString()).ToLowerInvariant();
      return new ProcessInfo { Executable = exeName };
  }
  ```
- Recompiled `NiyantranWin32Helper.exe` and verified via binary string analysis that zero window-title symbols exist in the PE binary.

---

### 3.5 DEF-005: Legacy Surveillance Artifacts (Keystrokes, Screenshots, OCR, URLs, Karma Penalties)

#### Symptom
Repository contained active schemas and routes for invasive surveillance:
- `KeystrokeLog.js` (raw typed character logging)
- `ScreenCapture.js` & `safeScreenshot.js` (periodic desktop screenshot capture)
- `ocrAnalysisService.js` (Tesseract.js OCR analyzing employee screens)
- `WebsiteWhitelist.js` (deep packet inspection of browser URLs)
- `karmaClient.js` (automated algorithmic disciplinary penalties)

#### Root Cause
Legacy V1 monitoring architecture was designed around covert workplace surveillance rather than transparent, privacy-respecting work verification.

#### Remediation
1. **Schema Excision**: Deleted `KeystrokeLog.js`, `ScreenCapture.js`, and removed screenshot/keystroke fields from all database models.
2. **OCR Elimination**: Uninstalled `tesseract.js`, deleted `eng.traineddata`, and eradicated `ocrAnalysisService.js`.
3. **URL Excision**: Replaced URL tracking with broad category mapping based exclusively on executable filename (`chrome.exe` -> `DOCUMENTATION` or `COMMUNICATION`).
4. **Karma Removal**: Stripped automated penalty deductions; replaced with explainable alerts requiring human managerial review.

---

### 3.6 DEF-006: Coupled Monitoring Outage & Attendance Failure

#### Symptom
When an employee's monitoring agent disconnected, crashed, or was closed, their workday attendance was invalidated or marked absent, causing unfair payroll deductions.

#### Root Cause
Workday attendance was tightly coupled to monitoring session heartbeat leases. If the monitoring lease expired, the system erroneously aborted the employee's attendance record.

#### Remediation
- **Attendance Decoupling**: Attendance (`Attendance`, `DailyAttendance`) and monitoring leases (`MonitoringSessionV2`) are separated into two decoupled domains.
- If the agent disconnects or monitoring authorization is withheld, attendance status evaluates to:
  $$\text{isPresent: true}, \quad \text{monitoringStatus: "Disconnected / Not Monitored"}$$
- UI displays a clear grey badge: *"Disconnected / Not Monitored"*, preserving complete attendance integrity while honestly reflecting telemetry status.

---

### 3.7 DEF-007: Mongoose Schema Enum Value Mismatch (`ACTIVE_MONITORING`)

#### Symptom
E2E Scenario 8 and Scenario 9 failed during attendance document creation with:
```
ValidationError: Attendance validation failed: monitoringStatus: `ACTIVE_MONITORING` is not a valid enum value for path `monitoringStatus`.
```

#### Root Cause
In `server/models/Attendance.js` and `DailyAttendance.js`, the enum specification is:
```javascript
monitoringStatus: {
  type: String,
  enum: ['Active', 'Disconnected / Not Monitored'],
  default: 'Disconnected / Not Monitored'
}
```
However, test setup code in `scenario.fullEmployeeWorkdayFlow.test.js` and `scenario.networkInterruptionRecovery.test.js` passed `'ACTIVE_MONITORING'` instead of the valid enum `'Active'`.

#### Remediation
Updated test seeds to provide the genuine enum value `'Active'`, ensuring 100% compliance with Mongoose model validation.

---

### 3.8 DEF-008: Unnormalized Timestamp in `DailyAttendance` End-Day Query

#### Symptom
E2E Tier 1 test `F13.endDayDailyReport.test.js` failed:
```
AssertionError: DailyAttendance must record endDayTime
```

#### Root Cause
In `server/routes/attendance.js`:
1. `start-day` creates `DailyAttendance` with normalized midnight date:
   ```javascript
   const today = new Date();
   today.setHours(0, 0, 0, 0);
   dailyRecord = new DailyAttendance({ user: userId, date: today, ... });
   ```
2. But in `end-day`, the lookup query evaluated `sessionDate` as:
   ```javascript
   const sessionDate = attendanceRecord.startDayTime || attendanceRecord.date || today;
   ```
   Because `attendanceRecord.startDayTime` has non-zero hours/minutes/seconds, `DailyAttendance.findOne({ user: userId, date: sessionDate })` failed to match the midnight-indexed document!

#### Remediation
Corrected `sessionDate` evaluation in `server/routes/attendance.js` to normalize the date to midnight:
```javascript
const sessionDate = attendanceRecord.date 
  ? new Date(attendanceRecord.date) 
  : new Date(attendanceRecord.startDayTime || today);
sessionDate.setHours(0, 0, 0, 0);

let dailyRecord = await DailyAttendance.findOne({ user: userId, date: sessionDate });
if (!dailyRecord) {
  dailyRecord = await DailyAttendance.findOne({
    user: userId,
    date: { $gte: sessionDate, $lt: sessionDateEnd }
  });
}
```

---

### 3.9 DEF-009: Vite Development Server Socket.io Proxy WebSocket Drop

#### Symptom
In development mode, real-time Socket.io events were failing to reach the frontend client, resulting in infinite polling and stale dashboard metrics.

#### Root Cause
`client/vite.config.js` had a proxy for `/api` but lacked WebSocket upgrade support (`ws: true`) for `/socket.io`. When the browser client attempted to establish an `engine.io` WebSocket connection, the Vite development proxy rejected the protocol upgrade.

#### Remediation
Configured explicit WebSocket proxy routing in `client/vite.config.js`:
```javascript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:5000',
      changeOrigin: true
    },
    '/socket.io': {
      target: 'http://localhost:5000',
      ws: true,
      changeOrigin: true
    }
  }
}
```

---

### 3.10 DEF-010: Mock Data Infiltration across Admin Live Team and Reports

#### Symptom
Admin Live Team and Analytics screens displayed hardcoded mock employees (*"Aarav Sharma"*, *"Priya Patel"*, *"Rohan Verma"*, *"Neha Gupta"*) with static 94% focus scores and hardcoded idle timers, regardless of actual employee database activity.

#### Root Cause
Legacy mock service modules (`MockDataService.js`, `mockFleetData.js`, `mockEmployeeData.js`) were wired into production React component state initialization when backend responses were slow or empty.

#### Remediation
- Audited and purged all production-path mock files.
- Connected `LiveTeamPage.jsx` and `ReportsPage.jsx` to live `/api/monitoring-v2/analytics/live-team` and `/api/monitoring-v2/reports/daily` endpoints.
- Replaced synthetic placeholders with authentic loading skeletons and empty-state indicators (*"No team members currently active"*).
