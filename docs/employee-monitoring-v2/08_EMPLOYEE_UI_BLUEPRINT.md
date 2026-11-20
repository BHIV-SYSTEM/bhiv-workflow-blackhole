# Employee Workspace: UI Blueprint & Compact Device Switcher

**Document ID:** `V2-DOC-08`  
**Classification:** Frontend User Experience Specification  
**Target Module:** `client/src/modules/employee-monitoring-v2/employee/`  
**Date:** November 2026  
**Status:** DRAFT / PENDING APPROVAL  

---

## 1. Design Philosophy: Self-Service & Anti-Surveillance

The Employee Workspace (`/monitoring-v2/workspace`) is designed from first principles as an **empowerment and transparency console**, rather than a surveillance monitor.

### Mandatory Access Bounds:
- **Zero Peer Surveillance:** Employees can **never** view peer presence, team focus scores, or organization analytics.
- **Self-Scope Only:** An employee can view only their own session status, active device, and personal timeline.
- **Privacy Transparency:** Employees have complete, unhindered visibility into exactly what data is being collected from their device.

---

## 2. Compact Device Switcher Specification

The device selector must be small, elegant, and unobtrusive. It is located directly in the header of the Employee Workspace:

```
┌─────────────────────────────────────────────────────────────┐
│  ACTIVE DEVICE: [ 🖥️ Laptop / PC  ▾ ]   [● Agent Online]    │
└─────────────────────────────────────────────────────────────┘
```

When clicked, it displays a clean dropdown:
1. **📱 Phone Mode:** Sets session mode to mobile workflows; halts desktop monitoring expectations.
2. **🖥️ Laptop / PC Mode (Active):** Connected to verified desktop agent; OS activity tracking enabled.
3. **🔄 Switch Device...:** Opens the secure handoff dialog.

### The Compact Switch Device Modal (`SwitchDeviceModal.jsx`):
```
┌──────────────────────────────────────────────────────────────────┐
│  🔄 Switch Active Work Session                                [✕]│
├──────────────────────────────────────────────────────────────────┤
│  Transfer active session from:                                   │
│  CURRENT:  🖥️ Office Workstation (Windows 11)                   │
│                                                                  │
│  Select Destination Device:                                      │
│  ( ) 📱 Mobile Phone (Phone Mode - Attendance preserved)         │
│  (•) 💻 Other Workstation (Home Laptop / MacBook)                │
│                                                                  │
│  Scan QR Code or enter Pairing PIN on destination device:        │
│                                                                  │
│                     ┌─────────────────┐                          │
│                     │  [QR CODE HERE] │                          │
│                     │  Session Handoff│                          │
│                     │   PIN: 849-204  │                          │
│                     └─────────────────┘                          │
│                                                                  │
│  ⚠️ Mutual Exclusion Guarantee: Current workstation monitoring  │
│     will halt automatically upon destination connection.         │
│                                                                  │
│  [ Cancel ]                                 [ Confirm Handoff ]  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Employee Workspace Screen Wireframe & Component Breakdown

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  NIYANTRAN V2  │  Employee Monitoring V2  >  My Workspace               Device: [ 🖥️ Laptop/PC ▾ ] [●]│
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                        │
│  ┌─ ACTIVE WORK SESSION ─────────────────────────────────────────────────────────────────────────────┐ │
│  │  Status: [● FOCUSED WORK]    Duration: 04h 15m    Current Mode: Laptop/PC (MacBook Pro)           │ │
│  │  Active Task: [#TK-841: Frontend Architecture Audit ▾]                                             │ │
│  │                                                                                                   │ │
│  │  [ ⏸️ Pause for Break ]      [ 🔄 Switch Device ]      [ 🛑 End Work Session ]                     │ │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                        │
│  ┌─ TODAY'S ACTIVITY TIMELINE (Aggregated 1-Minute Slices) ──────────────────────────────────────────┐ │
│  │  09:00       10:00       11:00       12:00       13:00       14:00       15:00       16:00       │ │
│  │  [██████████][████████░░][░░░░░░░░░░][██████████][██████████][████░░░░░░][══════════][██████████] │ │
│  │  ■ Development (64%)  ■ Documentation (18%)  ■ Communication (12%)  ░ Paused (6%)  ═ Offline      │ │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                        │
│  ┌─ DESKTOP AGENT HEALTH & DIAGNOSTICS ──────────────────────────────────────────────────────────────┐ │
│  │  Agent Version: v2.0.0 (Hardened)    Local Sync Buffer: 0 pending samples (Healthy)                │ │
│  │  Platform: macOS 14.5 (Sonoma)       Last Heartbeat: 4 seconds ago (Lease active)                  │ │
│  │  [ Run Connection Test ]             [ Download Desktop Agent ]                                    │ │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                        │
│  ┌─ PRIVACY & TRANSPARENCY SHIELD ───────────────────────────────────────────────────────────────────┐ │
│  │  🛡️ BYOD Protections Active:                                                                      │ │
│  │  ✓ ZERO Keystroke Recording (Characters and words are NEVER captured or stored)                   │ │
│  │  ✓ ZERO Screenshots (Screen content and webcam are NEVER recorded)                                │ │
│  │  ✓ ZERO URL / Browser History Tracking (Private web history is NEVER accessed)                    │ │
│  │  ✓ Personal Apps Excluded (WhatsApp, Spotify, and banking are automatically masked)                │ │
│  │                                                                                                   │ │
│  │  [ View Full Data Collection Policy ]         [ Manage Personal App Exclusions ]                  │ │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Component Specification & State Handlers

### 1. `EmployeeSessionHero.jsx`
- **State Handlers:**
  - `onStartWork()`: Verifies attendance start; requests session lease from `/api/monitoring-v2/sessions/start`.
  - `onPauseWork(reason, duration)`: Opens `PauseBreakDialog.jsx`; transitions session to `PAUSED`.
  - `onResumeWork()`: Calls `/api/monitoring-v2/sessions/resume`; resumes agent input counting.
  - `onEndWork()`: Calls `/api/monitoring-v2/sessions/end`; releases lease and triggers attendance clock-out.
- **Task Selector:** Dropdown populated from `GET /api/tasks/my-tasks`. Allows instant 1-click attribution of active focused work to assigned deliverables.

### 2. `TodayActivityTimeline.jsx`
- Renders an interactive, SVG-based timeline showing 1-minute blocks.
- **Hover Card:** Displays timestamp and category only (e.g., *14:32 - Development / VS Code*).
- Never reveals raw keycounts or sensitive process arguments to prevent employee anxiety.

### 3. `PrivacyTransparencyModal.jsx`
- Triggered by clicking "View Full Data Collection Policy".
- Displays the exact database JSON schema stored in MongoDB for that employee today, proving conclusively that no keystrokes, passwords, or images exist.
