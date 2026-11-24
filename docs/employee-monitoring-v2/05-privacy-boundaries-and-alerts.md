# Niyantran Employee Monitoring V2 — Privacy Boundaries & Explainable Alerts

**Document ID:** NEM-V2-DOC-05  
**Version:** 2.0.0-PROD  
**Classification:** Privacy Architecture, Governance & Explainability Specification  
**System Working Directory:** `g:\Blackhole\Niyantran`  

---

## 1. Surveillance Excision Proof & Zero-Surveillance Architecture

The core engineering mandate of Niyantran V2 is the complete, verifiable excision of invasive workplace surveillance. In traditional corporate monitoring tools, invasive features are embedded deep within low-level keyboard hooks, display capturing daemons, and browser extension sniffers. Niyantran V2 proves through source code audit, binary string analysis, and database schema inspection that all invasive surveillance mechanisms have been permanently eliminated.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                   INVASIVE SURVEILLANCE EXCISION AUDIT                           │
├────────────────────────────────┬────────────────────────┬───────────────────────┤
│ Surveillance Vector            │ Legacy V1 Status       │ Niyantran V2 Status   │
├────────────────────────────────┼────────────────────────┼───────────────────────┤
│ Raw Keystrokes & Typed Text    │ `KeystrokeLog.js`      │ PERMANENTLY DELETED   │
│ Desktop Screenshots & Videos   │ `ScreenCapture.js`     │ PERMANENTLY DELETED   │
│ Optical Character Recog (OCR)  │ `tesseract.js` + data  │ UNINSTALLED & REMOVED │
│ Full Web URLs & Browser Hist   │ `WebsiteWhitelist.js`  │ PERMANENTLY DELETED   │
│ Window Titles & Document Names │ `GetWindowTextW`       │ PERMANENTLY EXCISED   │
│ Automated Disciplinary Penalty │ `karmaClient.js`       │ ZERO AUTOMATED FINES  │
└────────────────────────────────┴────────────────────────┴───────────────────────┘
```

### 1.1 Technical Proof of Excision

#### 1. Keystroke Logging Excision
- **Excision**: All low-level keyboard hook APIs (`SetWindowsHookEx(WH_KEYBOARD_LL)`) and `KeystrokeLog` schemas were eradicated.
- **Verification**: The agent cannot access the character content of user input. Over each 60-second window, it records only an anonymous numeric integer delta (`keyPressCount: 42`).

#### 2. Screen Capture & Video Streaming Excision
- **Excision**: Modules `ScreenCapture.js`, `safeScreenshot.js`, and screen streaming WebRTC pipelines were eradicated from both server and agent.
- **Verification**: Zero image buffers or base64 strings exist in the database. Ingestion strictly rejects payloads with `screenshot` or `image` properties (`PRIVACY_VIOLATION`).

#### 3. Optical Character Recognition (OCR) Elimination
- **Excision**: Dependency `tesseract.js` was uninstalled, and OCR training assets (`eng.traineddata`) were removed from server disk.
- **Verification**: Server filesystem search confirms zero OCR models or traineddata files.

#### 4. Browser History & URL Snooping Excision
- **Excision**: Deep packet inspection, browser extension hooks, and `WebsiteWhitelist.js` were deleted.
- **Verification**: Browsers are tracked solely as top-level executable names (`chrome.exe`, `msedge.exe`). Full URLs, query strings, and path parameters are never collected or transmitted.

#### 5. Window Titles & Document Names Excision
- **Excision**: `GetWindowTextW` and `GetWindowText` Win32 calls were completely removed from `NiyantranWin32Helper.cs`.
- **Verification**: The native executable inspects only `QueryFullProcessImageName`. Binary inspection of `NiyantranWin32Helper.exe` confirms zero window-title symbols.

#### 6. Automated Algorithmic Penalties Elimination
- **Excision**: Algorithmic scoring that automatically docked employee pay, generated disciplinary demerits, or penalized breaks was eliminated.
- **Verification**: Disciplinary actions cannot be automated. All non-routine alerts require direct human administrative review with mandatory employee explanation opportunity.

---

## 2. Transparent Employee Disclosures

Employees are provided with complete visibility into monitoring operations through the web dashboard and desktop agent mini-window.

### 2.1 Transparency UI Standards

1. **Ambient Status Indicator**: The desktop system tray icon visually reflects current state (Green: Active Monitoring, Yellow: On Break, Grey: Disconnected / Not Monitored).
2. **On-Demand Disclosures Modal**: Accessible via the tray menu or dashboard, displaying:
   - Exactly what metrics are gathered during the current shift.
   - The explicit retention period (30 days rolling aggregate, auto-purged).
   - Legal basis and employee rights under data protection regulations (Right to Explanation, Right to Erasure upon exit).

---

## 3. Deterministic Explainable Activity Alert Engine

Niyantran V2 replaces opaque, probabilistic AI detection with an auditable, deterministic, rule-based alert engine operating within `server/services/trinetra/alertEngineService.js`.

```
       DETERMINISTIC EXPLAINABLE ALERT ENGINE ARCHITECTURE
       
                     [Incoming Telemetry Stream]
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │ Evaluate Explainable  │
                     │ Deterministic Rules   │
                     └───────────┬───────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            ▼                    ▼                    ▼
     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
     │ WHITE TIER   │     │ YELLOW TIER  │     │ RED TIER     │
     │ (Normal)     │     │ (Attention)  │     │ (Review)     │
     ├──────────────┤     ├──────────────┤     ├──────────────┤
     │ - In bounds  │     │ - Idle 30m   │     │ - Idle 45m+  │
     │ - Zero alert │     │ - Notice     │     │ - Human      │
     │ - Logged ok  │     │   badge      │     │   Review     │
     └──────────────┘     └──────────────┘     └──────┬───────┘
                                                      │
                                                      ▼
                                       ┌──────────────────────────────┐
                                       │ Real-Time Socket.io Alert    │
                                       │ to Employee & Admin Console  │
                                       └──────────────┬───────────────┘
                                                      │
                                                      ▼
                                       ┌──────────────────────────────┐
                                       │ Employee Explanation Modal   │
                                       │ (Constitutional Right)       │
                                       └──────────────┬───────────────┘
                                                      │
                                                      ▼
                                       ┌──────────────────────────────┐
                                       │ Admin Managerial Review      │
                                       │ Verdict: CLEARED / ACK       │
                                       │ (Zero Automated Penalties)   │
                                       └──────────────────────────────┘
```

### 3.1 Alert Tier Definitions

- **White Tier (Normal)**:
  - Standard operational telemetry. Input activity, focus scores, and application usage within acceptable baseline bounds. Zero notification noise.
- **Yellow Tier (Attention Required)**:
  - Moderate deviation from standard parameters (e.g. 30 consecutive minutes of hardware inactivity without an authorized break). Triggers an informational badge on the employee dashboard prompting them to log a break if away from keyboard.
- **Red Tier (Human Review Required)**:
  - Significant anomaly (e.g. 45+ minutes of continuous inactivity during an active workday, or conflicting multi-device sessions).
  - Triggers a formal review event requiring employee explanation and manager review.

### 3.2 Explainability Schema (`MonitoringAlert`)

Every alert is strictly explainable and contains full audit references:

```javascript
{
  alertId: "alert_1732164000_red_01",
  employeeId: "6b003575d7d9211bd68333ab",
  tier: "RED",
  ruleId: "RULE-REVIEW-001",
  title: "Extended Inactivity Alert",
  description: "No active keyboard/mouse input detected for 46 minutes while in active monitoring status.",
  thresholdValue: "45m",
  observedValue: "46m",
  eventReference: "telemetry_slice_1732163940",
  status: "ACTIVE", // ACTIVE | EXPLAINED | RESOLVED
  employeeExplanation: null,
  explainedAt: null,
  resolvedBy: null,
  resolvedAt: null,
  resolutionVerdict: null // CLEARED | ACKNOWLEDGED
}
```

---

## 4. Browser Executable Misconduct Exemption

A fundamental defect in legacy employee monitoring systems is classifying web browsers (`chrome.exe`, `msedge.exe`) as "non-work" or "entertainment" applications, triggering erroneous misconduct alerts when employees research, access cloud consoles, or read documentation.

### 4.1 Immunity Rule Specification

Niyantran V2 implements an immutable statutory exemption for web browser executables:

$$\forall e \in \{\text{chrome.exe, msedge.exe, firefox.exe, brave.exe, opera.exe}\}, \quad \text{IsMisconduct}(e) = \mathbf{False}$$

```javascript
// Browser Misconduct Immunity Rule — alertEngineService.js
const BROWSER_EXECUTABLES = new Set([
  'chrome.exe',
  'msedge.exe',
  'firefox.exe',
  'brave.exe',
  'opera.exe'
]);

function evaluateProcessMisconduct(executableName) {
  const exe = (executableName || '').toLowerCase();
  
  // Browsers are strictly exempt from misconduct classification
  if (BROWSER_EXECUTABLES.has(exe)) {
    return { isMisconduct: false, reason: 'Exempt Web Browser Platform' };
  }
  
  // Additional deterministic evaluation for unapproved executables...
}
```

Even if an employee operates a browser continuously for 8 hours without switching applications, the alert engine will **NEVER** issue a misconduct alert based on browser executable identification alone.

---

## 5. Employee Explanation & Admin Resolution Workflows

### 5.1 Employee Explanation Workflow

When an explainable alert is triggered:
1. A real-time Socket.io event (`employee-monitoring-alert`) is delivered to the employee's browser and mini-window.
2. The employee clicks **Submit Explanation** to open the explanation modal.
3. The employee submits their operational context (e.g. *"Was on a client phone call regarding the production deployment outage"*).
4. Endpoint: `POST /api/alerts/:alertId/explain`:
   - Updates `status = 'EXPLAINED'`.
   - Records `employeeExplanation` and `explainedAt`.
   - Emits real-time update to the Admin console.

### 5.2 Admin Review & Resolution Protocol

Managers review alerts with employee explanations in the **Admin Alerts Console** (`client/src/modules/employee-monitoring-v2/admin/pages/AlertsPage.jsx`):
1. The manager views the alert, threshold, observed metrics, and the employee's explanation side-by-side.
2. The manager chooses a resolution verdict:
   - **CLEARED**: The explanation is accepted as legitimate work; alert closed with no disciplinary record.
   - **ACKNOWLEDGED**: Manager notes the occurrence for regular coaching.
3. Endpoint: `POST /api/alerts/:alertId/resolve`:
   - Captures `resolvedBy: req.user.id`, `resolvedAt: new Date()`, `resolutionNotes: String`.
   - **Zero Automated Penalty Invariant**: The resolution does not deduct pay, alter attendance records, or deduct karma points.
