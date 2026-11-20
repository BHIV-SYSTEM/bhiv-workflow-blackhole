# Verified Repository Audit: Niyantran Employee Monitoring V1

**Document ID:** `V2-DOC-01`  
**Classification:** Technical Codebase Audit & Evidence Base  
**Target Repository:** `Niyantran` (Branch: `main`)  
**Date:** November 2026  
**Status:** VERIFIED  

---

## 1. Audit Scope & Verification Methodology

A comprehensive static code audit was conducted on the active `Niyantran` repository to verify existing monitoring implementations, dependencies, security boundaries, and runtime behaviors.

Every finding in this document has been directly checked against the active files on disk. Findings are classified as:
- **VERIFIED:** Source code exists, is wired into runtime paths, and behavior is confirmed.
- **PARTIAL:** Code exists but is incomplete, platform-limited, or contains logical gaps.
- **MISSING:** Feature is expected or referenced in docs, but zero implementation exists.
- **UNKNOWN:** Capability is referenced in binary dependencies or external systems without accessible code.

---

## 2. Comprehensive Inventory & Verification Table

| Subsystem / Component | Verified File Path | Line Range | Status | Observed Behavior & Deficiencies |
| :--- | :--- | :--- | :--- | :--- |
| **Browser Telemetry Service** | `client/src/services/monitoring-service.js` | L1–L520 | **VERIFIED** | Starts automatically on user login via `auth-context.jsx`. Hooks `focus`, `blur`, `visibilitychange`, `keydown`, `mousemove`. Flushes samples every 5s (`_sendTrinetraSample`) to `/api/agent/activity/ingest`. Blind to any application outside the browser. |
| **Browser Keystroke Text Capture** | `client/src/lib/keystroke-text-capture.js` | L1–L179 | **VERIFIED** | Intercepts DOM `keydown` events, reconstructs full typed words and sentences into segments (up to 1,000 chars), and uploads to `/api/agent/keystroke/ingest`. Sensitive regex only checks element attributes. Major BYOD privacy liability. |
| **PRANA Core Signals** | `client/src/lib/prana-core/signals.js` | L1–L353 | **VERIFIED** | Captures window focus, scroll depth, and mouse velocity on the browser window. Strictly limited to browser DOM context. |
| **Employee Monitoring Page** | `client/src/pages/EmployeeMonitoring.jsx` | L1–L713 | **VERIFIED** | Monolithic admin view containing 12+ sub-views in an overcrowded horizontal tab bar. Relies on HTTP polling every 15s (`fetchTeamSummary`). |
| **TRINETRA AI Console** | `client/src/components/monitoring/TrinetraConsole.jsx` | L1–L1350 | **VERIFIED** | Manager console for TRINETRA AI. Displays live telemetry matrix, activity timeline, alerts, and verification matrix via periodic HTTP polling. |
| **Admin Keystroke Viewer** | `client/src/components/monitoring/KeystrokeTextPanel.jsx` | L1–L246 | **VERIFIED** | Displays verbatim employee typed text to admins with classification badges (`valuable`, `low_value`, `key_mashing`). Extreme privacy risk. |
| **Desktop Agent Runtime** | `employee-agent/src/main.js` | L1–L648 | **VERIFIED** | Electron 28.1.3 app. System tray icon. Insecurely stores employee credentials in plaintext in `electron-store` (L248). |
| **Desktop Activity Tracker** | `employee-agent/src/managers/activityTracker.js` | L1–L480 | **VERIFIED** | Hooks global keyboard/mouse using `uiohook-napi`. Aggregates events into 5s windows. Relies on Electron `powerMonitor.getSystemIdleTime()`. |
| **Desktop Keystroke Capture** | `employee-agent/src/utils/keystrokeCapture.js` | L1–L238 | **VERIFIED** | Reconstructs typed sentences from raw scan codes using US character mapping (`CHAR_MAP`). Uploads text to `/api/agent/keystroke/ingest`. |
| **Active App Watcher** | `employee-agent/src/utils/activeAppWatcher.js` | L1–L109 | **PARTIAL** | Windows-only! Spawns an infinite `powershell.exe` loop polling `GetForegroundWindow` via `user32.dll` every 1,500ms. High CPU overhead; completely fails on macOS/Linux. |
| **Desktop Screenshot Engine** | `employee-agent/src/managers/screenshotEngine.js` | L1–L407 | **VERIFIED** | Captures full desktop screens using Electron `desktopCapturer`. Computes dHash for deduplication. Incompatible with BYOD privacy. |
| **Desktop Build Script** | `employee-agent/build-portable.ps1` | L1–L120 | **PARTIAL** | Unsigned portable build script copying Electron binaries and creating `.bat`/`.ps1` launchers. No code signing, no auto-updater. |
| **Agent Ingestion API** | `server/routes/agentActivity.js` | L1–L452 | **VERIFIED** | Ingests telemetry at `POST /api/agent/activity/ingest` and text at `POST /api/agent/keystroke/ingest`. Deduplicates browser telemetry if desktop telemetry arrived within 15s. |
| **Legacy Monitoring Router** | `server/routes/monitoring.js` | L1–L2557 | **VERIFIED** | Unwieldy 2,557-line router with 35+ endpoints. Lacks `auth` middleware on `/start/:employeeId`, `/stop/:employeeId`, and `/employees/:id/screenshots`. |
| **EMS Signal Layer** | `server/services/ems_signals.js` | L1–L821 | **VERIFIED** | In-memory signal processor storing state in a Node.js `Map()`. State is completely lost upon server restart or cluster autoscaling. |
| **Server-Side Screenshot Engine** | `server/services/screenCapture.js` & `safeScreenshot.js` | L1–L333 (service), L1–L45 (util) | **PARTIAL / BROKEN** | Attempts to run `screenshot-desktop` on the **Node.js backend server** itself. Catches errors on headless Linux, but represents architectural confusion. |
| **Device Registration & Management** | — | — | **MISSING** | No models, routes, or database schemas exist for device registration, device binding, cryptographic identity, or device switching handoff. |

---

## 3. Analysis of Critical Deficiencies

### A. The False Idle Attribution Mechanism
When an employee does not have the desktop agent running and switches from the Niyantran browser tab to VS Code or Terminal:
1. `window.onBlur` fires in `monitoring-service.js`.
2. Browser DOM event listeners receive zero input events.
3. `_tKeys` and `_tMouse` stay frozen at 0.
4. `idleSeconds` accumulates linearly: `Date.now() - _tLastInputAt`.
5. Every 5 seconds, the browser posts `source: 'browser', keyboardEvents: 0, mouseEvents: 0, idleSeconds: 300+`.
6. `telemetryMetrics.js` evaluates the sample: because `hasInput === false` and `rawIdle >= 300`, it flags `isIdleSample = true` and `qualityScore = 0`.
7. **Result:** An engineer actively writing code in VS Code is reported as 100% idle.

### B. Severe Privacy Violations (Keylogging & Screenshots)
- In both browser (`keystroke-text-capture.js`) and desktop (`keystrokeCapture.js`), characters are assembled into text strings.
- Stored in MongoDB collection `keystroke_logs` with fields `text`, `application_name`, and `window_title`.
- Accessible to managers via `GET /api/monitoring/employees/:id/keystrokes` and rendered in `KeystrokeTextPanel.jsx`.
- If an employee on a personal BYOD laptop opens a banking portal or personal chat, typed credentials or private messages risk being harvested.

### C. Unauthenticated Administrative Endpoints
In `server/routes/monitoring.js`:
- `POST /api/monitoring/start/:employeeId` (L97) has no auth middleware.
- `POST /api/monitoring/stop/:employeeId` (L132) has no auth middleware.
- `GET /api/monitoring/employees/:id/activity` (L238) has no auth middleware.
- `GET /api/monitoring/employees/:id/screenshots` (L381) has no auth middleware.
- Anyone with network visibility can query activity logs, view screenshots, or trigger session state changes.

### D. Server Display Capture Fallacy
`server/utils/safeScreenshot.js` uses `screenshot-desktop` to capture a screen buffer directly on the backend machine:
```javascript
const screenshot = require('screenshot-desktop');
async function captureSafeScreenshot(options = { format: 'png' }) {
  if (!hasDesktopDisplay()) return null;
  return await screenshot(options);
}
```
This demonstrates severe architectural confusion: capturing the server's desktop display provides zero intelligence regarding the employee's remote workstation.

---

## 4. Audit Sign-Off

The legacy V1 monitoring system is technically fragile, privacy-invasive, and architecturally confounded. It cannot be salvaged via incremental patches. 

**Architectural Verdict:** Build **Employee Monitoring V2** as a completely separate, standalone subsystem with independent APIs, database models, desktop agent, and user interfaces.
