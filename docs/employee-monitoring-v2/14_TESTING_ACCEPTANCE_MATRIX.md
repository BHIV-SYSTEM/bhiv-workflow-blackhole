# Testing & Production Acceptance Matrix: 28 Mandatory Scenarios

**Document ID:** `V2-DOC-14`  
**Classification:** Quality Assurance & Acceptance Specification  
**Target Repository:** `Niyantran`  
**Date:** November 2026  
**Status:** DRAFT / PENDING APPROVAL  

---

## 1. Quality Assurance Governance

In accordance with Section 13 of the Master Engineering Directive, every test in this matrix must be executed with verifiable evidence before progressing past Quality Gate F. Under no circumstances may a test be marked as passed without recorded logs.

---

## 2. The 28-Point Production Acceptance Matrix

| # | Test Scenario | Preconditions | Execution Steps | Expected Result & Verification Criteria | Severity |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **01** | **Closing Niyantran Tab** | Active monitored session on desktop. | 1. Open Niyantran in Chrome.<br>2. Close the tab.<br>3. Work in VS Code for 20m. | Desktop Agent continues streaming telemetry. Admin dashboard reflects `ACTIVE`. Zero idle time generated. | **CRITICAL** |
| **02** | **Closing Chrome Completely** | Active monitored session on desktop. | 1. Close Google Chrome (`Alt+F4` / `Cmd+Q`).<br>2. Work in Terminal for 20m. | Agent continues streaming telemetry unaffected. Zero dependency on browser process. | **CRITICAL** |
| **03** | **Switching Chrome to VS Code** | Desktop agent active. | 1. Switch focus from Chrome to VS Code.<br>2. Type code for 10m. | Foreground category shifts to `DEVELOPMENT`. Keys and mouse counted. Score remains > 85%. | **CRITICAL** |
| **04** | **Switching VS Code to Terminal** | Desktop agent active. | 1. Open Terminal/PowerShell.<br>2. Execute commands and scripts for 10m. | Category tracked as `DEVELOPMENT`. Input counted. Zero false idle flags. | **HIGH** |
| **05** | **Keyboard & Mouse Aggregation** | Desktop agent active. | 1. Perform 100 keystrokes and 50 mouse moves.<br>2. Inspect outgoing payload. | Discards keycodes; payload contains only `keyPressCount: 100`, `mouseActivityDelta: 50`. | **CRITICAL** |
| **06** | **Work-Session Pause / Resume** | Active session. | 1. Click "Pause for Break" in tray.<br>2. Wait 10m.<br>3. Click "Resume Work". | Input hooks halt during pause. Timeline tags 10m as `PAUSED`. Session resumes cleanly. | **HIGH** |
| **07** | **Work-Session End** | Active session. | 1. Click "End Work Session" in UI or tray. | Releases lease, flushes final buffered interval, halts hooks, triggers attendance clock-out. | **HIGH** |
| **08** | **Personal App Exclusions** | BYOD laptop, agent active. | 1. Focus WhatsApp/Spotify.<br>2. Type messages for 5m. | Transmitted as `EXCLUDED_PERSONAL`. Title redacted to `[Private Content]`. Counters set to 0. | **CRITICAL** |
| **09** | **Phone Login** | Employee on mobile device. | 1. Login via mobile browser.<br>2. Punch attendance. | Active in `MODE: PHONE_WORKFLOW`. Zero desktop telemetry expected; zero idle penalty assigned. | **HIGH** |
| **10** | **Laptop Login** | Employee on workstation. | 1. Login via desktop browser.<br>2. Start Day. | Verified agent pairs and acquires 60s lease. Transitions state to `ACTIVE`. | **HIGH** |
| **11** | **Phone-to-PC Handoff** | Active Phone session. | 1. Open Desktop Workspace.<br>2. Select "Switch Device" to Laptop. | Transitions session to `LAPTOP_PC` mode. Agent starts tracking. Workday history unified. | **HIGH** |
| **12** | **PC-to-PC Handoff** | Active on Laptop A. | 1. Open Laptop B.<br>2. Initiate handoff with PIN. | Server revokes Laptop A lease; grants Laptop B lease. Laptop A halts monitoring cleanly. | **HIGH** |
| **13** | **Duplicate Session Prevention** | Active on Laptop A. | 1. Launch Agent on Laptop B.<br>2. Attempt concurrent session. | Server rejects Laptop B with `409 DUPLICATE_MONITORING_REJECTED`. Laptop A lease undisturbed. | **CRITICAL** |
| **14** | **Agent Crash Recovery** | Active session. | 1. Force kill agent via Task Manager.<br>2. Relaunch agent after 15s. | Agent reads stored token, verifies session in DB, and resumes tracking within 20s. | **HIGH** |
| **15** | **Internet Outage** | Active session. | 1. Disconnect network for 15m.<br>2. Continue working. | Agent queues samples in local AES-256-GCM buffer. Zero data loss. | **CRITICAL** |
| **16** | **Offline Queue Sync** | 15m buffered samples. | 1. Reconnect network. | Flushes `/ingest/sync-offline`. Server marks `OFFLINE_SYNCED`. Local buffer purged. | **CRITICAL** |
| **17** | **OS Sleep / Wake** | Laptop active on battery. | 1. Close lid for 20m.<br>2. Open lid and unlock. | PowerMonitor detects suspend; halts ticks. On wake, re-checks lease and resumes cleanly. | **CRITICAL** |
| **18** | **OS Lock / Unlock** | Active session. | 1. Lock screen (`Win+L`) for 10m.<br>2. Unlock screen. | State transitions to `AWAY` while locked. Resumes `ACTIVE` upon unlock. | **HIGH** |
| **19** | **Permission Revocation** | macOS agent running. | 1. Revoke Accessibility in macOS Settings. | Agent detects permission drop; updates tray to `⚠️ Permissions Required` without crashing. | **HIGH** |
| **20** | **Unauthorized Admin API Access**| Employee JWT token. | 1. Send `GET /api/monitoring-v2/fleet-summary`. | Server responds `403 Forbidden: INSUFFICIENT_ROLE`. Access denied. | **CRITICAL** |
| **21** | **Cross-Employee Data Access** | Employee A token. | 1. Send `GET /timeline/:employeeB_Id`. | Server responds `403 Forbidden: INSUFFICIENT_SCOPE`. Security audit logged. | **CRITICAL** |
| **22** | **Admin Role Scope Enforcement**| Branch Admin token. | 1. Query fleet data for other branch. | Server filters results strictly to assigned branch (`x-branch`). Cross-branch data blocked. | **HIGH** |
| **23** | **WebSocket Authorization** | Employee A socket. | 1. Emit `socket.emit('join', 'room:fleet')`.| Server verifies role; drops unauthorized join. Emits error event. | **HIGH** |
| **24** | **V1 Monitoring Regression** | Legacy `/monitoring` view. | 1. Navigate to legacy monitoring UI.<br>2. Verify all tabs. | Legacy V1 UI, routes, and services operate with 100% normal behavior. Zero regression. | **CRITICAL** |
| **25** | **Other Niyantran Regressions**| Core business modules. | 1. Test Attendance, Tasks, Salary, Aims. | All core Niyantran modules operate with zero errors or schema conflicts. | **CRITICAL** |
| **26** | **Desktop Resource Limits** | Active coding for 8 hours. | 1. Profile with Task Manager / Instruments. | RAM < 120MB, CPU < 0.4%, battery drain < 1% over 8h. Meets performance budget. | **HIGH** |
| **27** | **Signed Installer & Updates** | Clean test VM. | 1. Install via signed NSIS `.exe` / DMG.<br>2. Check update feed. | Installs silently in user space without UAC prompt. Validates digital certificate. | **HIGH** |
| **28** | **Rollback Readiness** | V2 active on staging. | 1. Set `ENABLE_MONITORING_V2=false`.<br>2. Restart server. | V2 routes return 404; sidebar hides V2 link. Entire system reverts to V1 cleanly. | **CRITICAL** |

---

## 3. Automated Privacy Assertion Test Suite

```javascript
// tests/security/privacyAssertions.test.js
describe('Automated Anti-Surveillance & BYOD Privacy Suite', () => {
  it('MUST NOT store raw text fields in any V2 collection', async () => {
    const v2Collections = ['monitoring_v2_telemetry', 'monitoring_v2_sessions', 'monitoring_v2_devices'];
    for (const col of v2Collections) {
      const recordsWithText = await mongoose.connection.collection(col).find({ text: { $exists: true } }).toArray();
      expect(recordsWithText.length).toBe(0);
    }
  });

  it('MUST NOT store screenshot binary data or images', async () => {
    const imageRecords = await mongoose.connection.collection('monitoring_v2_telemetry').find({
      $or: [{ image: { $exists: true } }, { screenshot: { $exists: true } }, { base64: { $exists: true } }]
    }).toArray();
    expect(imageRecords.length).toBe(0);
  });

  it('MUST NOT harvest private browser URLs', async () => {
    const urlRecords = await mongoose.connection.collection('monitoring_v2_telemetry').find({
      $or: [{ url: { $exists: true } }, { browser_history: { $exists: true } }]
    }).toArray();
    expect(urlRecords.length).toBe(0);
  });
});
```
