# Privacy-First BYOD Architecture & Compliance Blueprint

**Document ID:** `PRIVACY-BYOD-005`  
**Classification:** Privacy Architecture, Legal Compliance & Migration Plan  
**Date:** November 2026  
**Status:** COMPLETE  
**Scope:** Privacy-Preserving Monitoring, BYOD Protections, Regulatory Compliance & V1 Keystroke Deprecation  

---

## 1. Executive Summary: The BYOD Imperative

Bring Your Own Device (BYOD) is common across modern engineering and remote teams. When an employee uses their personal laptop for work:
1. Personal data (banking, private emails, medical records, chat apps, passwords, family photos) resides on the same machine alongside work artifacts.
2. Traditional surveillance software that logs keystrokes, screenshots the desktop, or tracks full browser history creates **extreme legal liabilities**, destroys workplace trust, and directly violates data protection regulations.
3. Employee consent **alone is legally insufficient** under international privacy frameworks (e.g., GDPR Recital 43, India's DPDP Act 2023 Section 6) due to the inherent power imbalance between employer and employee.

**Mandate for Niyantran V2:** The employee monitoring system must be redesigned around **Privacy-by-Design**, strict data minimization, clear boundaries between work and personal activity, and full employee transparency.

---

## 2. Mandatory Privacy Safeguards & Technical Enforcements

| Privacy Dimension | V1 Legacy Behavior (Audited) | V2 Architectural Guarantee | Technical Enforcement Mechanism |
| :--- | :--- | :--- | :--- |
| **Keyboard Monitoring** | Raw keystroke reconstruction (`keystrokeCapture.js` & `KeystrokeLog.text`). | **Aggregated Count Only.** Zero character recording. | Agent discards keycodes immediately; increments only `keyPressCount += 1`. |
| **Mouse Monitoring** | Raw coordinate logging and arbitrary velocity metrics. | **Aggregated Movement Delta.** | Throttled delta counter per 10s interval (`mouseActivityDelta`). |
| **Screen Content** | Periodic full-desktop screenshots via `desktopCapturer` & server `screenshot-desktop`. | **ZERO Screen Captures in BYOD.** No screen recording. | `screenshotEngine.js` completely deleted. Agent has no screen capture code. |
| **Audio / Video** | Latent risk in codebase dependencies. | **ZERO Webcam or Microphone Access.** | Binary manifests explicitly forbid AV permissions (`Info.plist`, Windows manifest). |
| **Clipboard Inspection** | Unbounded risk in native agent. | **ZERO Clipboard Access.** | OS clipboard APIs are never imported or invoked. |
| **Browser History & URLs** | Harvests full URLs (`window.location.href`) and document titles. | **Domain Allowlisting & No Private URLs.** | Agent only inspects root process name (`code.exe`, `chrome.exe`). No browser tab URLs or private history. |
| **Work vs Personal Apps** | Powershell loop scans all foreground window titles. | **Category Mapping & Personal Blacklist.** | Process names are mapped locally to categories; personal apps (`whatsapp`, `spotify`) reported only as `EXCLUDED_PERSONAL`. |
| **Time Boundaries** | Browser listeners ran continuously on login. | **Strict Workday Gating.** | Agent is dormant until server-authoritative session starts; auto-terminates on "End Day". |
| **Employee Controls** | Monitoring controls were admin-only. | **Visible Controls for Employee.** | Floating/Tray UI with 1-click **Pause Monitoring**, **Resume**, and **End Work**. |
| **Transparency** | Employee could not view what data was stored. | **Self-Service Privacy Dashboard.** | Employee can inspect their exact aggregated timeline and collection status anytime in V2 UI. |

---

## 3. Safe Migration & Deprecation of Legacy Keystroke System

### Code Artifacts Slated for Deprecation:
1. `client/src/lib/keystroke-text-capture.js` (Browser text reconstructor)
2. `employee-agent/src/utils/keystrokeCapture.js` (Desktop scan code translator)
3. `server/models/KeystrokeLog.js` (Mongoose collection storing typed text)
4. `server/routes/agentActivity.js` (L235–L350: `POST /api/agent/keystroke/ingest`)
5. `server/services/keystrokeQuality.js` & `keystrokeAnalyticsService.js` (Text quality classifiers)
6. `client/src/components/monitoring/KeystrokeTextPanel.jsx` (Admin text reader)

### 3-Stage Safe Migration Plan:

```mermaid
flowchart LR
    subgraph Stage 1: Immediate Ingestion Shutdown
        A[Client & Agent Telemetry] -->|Drop Keystroke Text Payloads| B[Agent Sends Counts Only]
        C[POST /api/agent/keystroke/ingest] -->|Return 410 Gone / Deprecated| D[No New Text Stored]
    end

    subgraph Stage 2: Historical Data Redaction & Sanitization
        E[KeystrokeLog Collection] -->|MongoDB Update Script| F[Purge 'text' & 'window_title' fields]
        F -->|Retain Only| G[key_count, char_count, duration_ms]
    end

    subgraph Stage 3: Codebase Purge & UI Decoupling
        H[Delete keystroke-text-capture.js]
        I[Delete keystrokeCapture.js]
        J[Deprecate KeystrokeTextPanel.jsx]
        K[Retire KeystrokeLog Model]
    end

    Stage 1 --> Stage 2 --> Stage 3
```

#### Step 1: Immediate Ingestion Shutdown
- Modify `POST /api/agent/keystroke/ingest` in `server/routes/agentActivity.js` to immediately return `{ success: true, message: "Keystroke text capture deprecated in favor of V2 aggregated metrics." }` without performing `KeystrokeLog.insertMany()`.
- Disable `_textCapture` instantiations in `monitoring-service.js` and `activityTracker.js`.

#### Step 2: Database Sanitization (Zero Data Loss for Productivity Ratios)
- Run a one-time migration script on MongoDB:
  ```javascript
  // Sanitization script: drops all raw text content while preserving counters for historical compliance
  db.keystroke_logs.updateMany(
    { text: { $exists: true, $ne: "" } },
    { 
      $unset: { text: "", window_title: "" },
      $set: { "metadata.sanitized": true, "metadata.sanitizedAt": new Date() }
    }
  );
  ```
- Accelerate TTL expiration on `keystroke_logs` from 30 days to 7 days.

#### Step 3: Complete Removal of Admin Keystroke Viewer
- Remove `<KeystrokeTextPanel />` from `EmployeeMonitoring.jsx` and manager modals.
- Replace with the V2 **Activity Distribution Widget** (displaying categorized focus time: Coding, Review, Documentation).

---

## 4. Legal & Regulatory Compliance Framework

### A. Digital Personal Data Protection Act, 2023 (DPDP Act - India)
- **Section 4 & 5 (Lawful Purpose & Notice):** Employers must provide unambiguous, prior notice specifying exactly what data is collected. Collecting raw keystrokes and private chat messages exceeds any lawful purpose of evaluating workplace attendance and deliverables.
- **Section 6 (Consent Architecture):** Consent must be free, specific, informed, and unconditional. In an employment contract, blanket consent to keylogging or screen surveillance is legally invalid because the employee cannot freely refuse without risking employment repercussions.
- **Section 8 (Data Minimization & Erasure):** Telemetry must be retained only as long as necessary. V2 implements strict 90-day automatic MongoDB TTL expiration on raw 1-minute samples, rolling historical data into anonymous monthly aggregates.

### B. General Data Protection Regulation (GDPR - EU / Multinational)
- **Article 5(1)(c) (Data Minimization):** Personal data must be adequate, relevant, and limited to what is strictly necessary in relation to the purposes for which they are processed. Keyloggers and full-screen captures violate this article per se.
- **Article 9 (Processing of Special Categories of Personal Data):** Reconstructing typed text inevitably captures trade union activity, political opinions, health data, or private sexual orientation (if an employee logs into a personal account). Processing special category data without an explicit Article 9(2) exception constitutes a severe GDPR violation with fines up to €20M or 4% of global turnover.
- **Article 25 (Data Protection by Design and by Default):** Technical systems must enforce privacy by default. Niyantran V2 enforces this by calculating focus metrics client-side and transmitting only high-level aggregates.

### C. Proportionality & Legitimate Interest
Under European Court of Human Rights (ECHR) precedents (*Bărbulescu v. Romania*), workplace monitoring is lawful **only if**:
1. The employer had a legitimate aim (ensuring work is done).
2. Less intrusive methods were examined and deemed insufficient.
3. The employee received clear prior notification.
4. Monitoring is targeted to work time and excluded from private activities.
Niyantran V2 satisfies all four tests by using activity counting and application categorization rather than surveillance.

---

## 5. Work-Application Allowlist & Personal Privacy Exclusions

To prevent surveillance of personal activities on BYOD machines, the desktop agent employs a **Local Application Categorizer**:

```
[Local Window Event] ---> Process: "whatsapp.exe"
                             │
                             ▼
                     [Allowlist Engine]
                             │
              Is in Work Allowlist? NO
              Is in Known Personal List? YES (WhatsApp)
                             │
                             ▼
             [Locally Sanitized Payload]
             Category: "EXCLUDED_PERSONAL"
             Window Title: REDACTED
             Key Count: 0 (Supressed during personal apps)
             Mouse Count: 0
```

### Configurable Organization Work Allowlist:
- **Development Tools (`DEVELOPMENT`):** VS Code, Visual Studio, IntelliJ IDEA, WebStorm, PyCharm, Android Studio, Xcode, Eclipse, Terminal, PowerShell, Git Bash, Docker Desktop, Postman.
- **Documentation & Product (`DOCUMENTATION`):** Notion, Jira, Confluence, Google Docs, Figma, Miro, Draw.io, LibreOffice.
- **Communication (`COMMUNICATION`):** Slack, Microsoft Teams, Zoom, Google Meet, Discord (Work channels).
- **Work Browsers (`BROWSER_WORK`):** Chrome, Edge, Firefox, Brave, Safari (monitored for presence, but individual tab titles and URLs are never recorded).

### Automatic Privacy Exclusions (`EXCLUDED_PERSONAL`):
- Any process matching: `whatsapp`, `telegram`, `signal`, `spotify`, `steam`, `netflix`, `discord` (personal), `keepass`, `1password`, `bitwarden`, `banking`, `vlc`.
- When an excluded application is in the foreground:
  - Process name is transmitted as `'EXCLUDED_PERSONAL'`.
  - Window title is transmitted as `'[Private Content]'`.
  - Input counting is temporarily paused so that personal conversations or typed passwords are not counted in telemetry.
