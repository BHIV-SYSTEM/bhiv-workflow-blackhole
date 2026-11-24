# Niyantran Employee Monitoring V2 — Desktop Agent

## Architecture & Design Principles (Phase A Scaffolding)

This directory contains the independent desktop agent for **Niyantran Employee Monitoring V2**.

---

### 1. Core Architectural Mandates

1. **Strict V1/V2 Non-Interference:**
   - V2 never terminates, kills, pauses, uninstalls, or modifies the legacy V1 agent (`employee-agent`).
   - V2 utilizes passive process detection (`src/conflictDetector.js`) to detect if V1 is running.
   - If V1 is detected, V2 enters the `V1_AGENT_CONFLICT` state and refuses to activate telemetry collection.
   - Safe migration occurs via explicit manual handoff by the user or administrator.

2. **Zero Invasiveness / Privacy-by-Design:**
   - **No Keylogging:** Raw scan codes, key sequences, and typed sentences are permanently prohibited. Only numeric counts of keystrokes per 60-second window are gathered.
   - **No Screenshots:** Zero visual capture of screens, active application windows, or displays.
   - **No Clipboard Inspection:** Clipboard contents and local files are never inspected, read, or transmitted.
   - **No Personal Application Inspection:** Non-work categories are aggregated as generic activity without recording URLs, document titles, or private metadata.

3. **Autonomous Session Leasing:**
   - Heartbeats and telemetry operate on 60-second intervals with a strict 90-second server lease timeout.
   - If an agent loses connectivity, crashes, or goes offline, the server automatically expires the lease at 90 seconds. Sessions never hang open indefinitely.

4. **Phase A Isolation:**
   - In Phase A, no native OS hooks (`uiohook`, etc.) are installed or loaded.
   - No background daemons or auto-start registry keys are created.
   - All modules exist as verified contract definitions and unit test harnesses.

---

### 2. Module Directory Structure

```
employee-agent-v2/
├── package.json               # Package definition (no native hook dependencies in Phase A)
├── README.md                  # This documentation
├── src/
│   ├── config.js              # Agent configuration & privacy constraints
│   ├── conflictDetector.js    # Passive detection of legacy V1 agent processes
│   ├── lifecycle.js           # Agent state machine (INITIALIZING, CONFLICT, IDLE, ACTIVE)
│   ├── native/
│   │   └── inputCounter.js    # Interface contract for input counting (stubs only)
│   └── storage/
│       └── secureStore.js     # Interface contract for secure token storage
└── tests/
    └── agent.test.js          # Unit tests verifying state machine & conflict logic
```
