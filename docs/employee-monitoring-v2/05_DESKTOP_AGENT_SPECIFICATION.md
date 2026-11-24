# Desktop Agent V2: Technical Specification & Implementation Architecture

**Document ID:** `V2-DOC-05`  
**Classification:** Desktop Systems Engineering Specification  
**Target Subsystem:** `employee-agent-v2/`  
**Date:** November 2026  
**Status:** UPDATED FOR PHASE A CORRECTIONS  

---

## 1. Directory Structure & Modular Layout

```
employee-agent-v2/
├── package.json                     # Metadata only in Phase A
├── electron-builder.yml             # Code signing & NSIS/DMG packaging config
├── src/
│   ├── main.js                      # Electron Lifecycle, Single-Instance Lock, IPC Bus
│   ├── preload.js                   # ContextIsolation Preload Script
│   ├── native/                      # Precompiled Native OS Addons
│   │   ├── win32/activeApp.node     # C++ Win32 GetForegroundWindow binding
│   │   └── darwin/frontmostApp.node # Objective-C Cocoa NSWorkspace binding
│   ├── managers/                    # Core Business Engines
│   │   ├── conflictDetector.js      # Passive V1 Process Detector (Non-Invasive)
│   │   ├── inputCounter.js          # Global Keyboard/Mouse counting (uiohook-napi)
│   │   ├── idleMonitor.js           # Hardware Idle & Power State Hooks (powerMonitor)
│   │   ├── appCategorizer.js        # Maps process executable to work categories
│   │   ├── sessionLeaseManager.js   # 10s Heartbeat, 60s lease renewal & autonomous expiry
│   │   └── syncEngine.js            # Batch transmitter & offline queue manager
│   ├── storage/                     # Secure Local Persistence
│   │   ├── secureStore.js           # Electron safeStorage wrapper (DPAPI/Keychain)
│   │   └── encryptedQueue.js        # AES-256-GCM SQLite ring buffer (offline queue)
│   ├── ui/                          # User Interface & System Tray
│   │   ├── trayManager.js           # Tray icon, dynamic menus, conflict notifications
│   │   └── miniWidget/              # Compact status widget
│   └── utils/
│       ├── cryptoSigner.js          # HMAC-SHA256 signature generator
│       └── logger.js                # Local rolling log file (sanitized)
└── tests/
    ├── conflictDetector.test.js
    └── syncEngine.test.js
```

---

## 2. V1 Agent Conflict Detection & Safe Handoff (Correction 1)

**Strict Prohibition:** V2 must **never** terminate, pause, disable, uninstall, or alter V1 automatically.

```javascript
// employee-agent-v2/src/managers/conflictDetector.js
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class ConflictDetector {
  /**
   * Non-invasively inspects running processes to determine if V1 is active.
   * Returns true if V1 process exists; does NOT send kill or pause signals.
   */
  static async isV1AgentRunning() {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq employee-activity-agent.exe" /NH');
        return stdout.toLowerCase().includes('employee-activity-agent.exe');
      } else if (process.platform === 'darwin' || process.platform === 'linux') {
        const { stdout } = await execAsync('pgrep -f "employee-activity-agent"');
        return Boolean(stdout.trim());
      }
      return false;
    } catch (_) {
      return false; // Process query failure falls back to safe non-conflict state
    }
  }
}
```

### Conflict Handling State Machine:
1. **Detection on Startup:** Before initializing `uiohook-napi`, V2 calls `ConflictDetector.isV1AgentRunning()`.
2. **Refusal to Activate:** If V1 is detected:
   - V2 transitions to state `V1_AGENT_CONFLICT`.
   - V2 strictly **refuses** to start its input hooks.
   - V2 tray icon changes to amber (`⚠️ Conflict: Legacy Agent Running`).
3. **Employee Notification:** A clear system tray notification informs the employee:
   > *"Legacy Monitoring Agent V1 is currently active. To prevent duplicate telemetry and input lag, V2 monitoring is standing by. Please close or pause the V1 Agent manually if you wish to run V2."*
4. **Preservation of V1:** If the employee takes no action or closes V2, V1 continues tracking without disruption.

---

## 3. Input Hook Architecture (Counts Only)

```javascript
// employee-agent-v2/src/managers/inputCounter.js
class InputCounter {
  constructor() {
    this.keyPressCount = 0;
    this.mouseEventCount = 0;
    this.scrollEventCount = 0;
    this._lastMouseMove = 0;
  }

  handleKeyDown(event) {
    // CRITICAL: We NEVER inspect or record event.keycode!
    // Discard keycode immediately; increment count only.
    this.keyPressCount++;
  }

  handleMouseMove(event) {
    const now = Date.now();
    // Throttle cursor movement counting to at most 10 per second
    if (now - this._lastMouseMove >= 100) {
      this._lastMouseMove = now;
      this.mouseEventCount++;
    }
  }

  handleWheel(event) {
    this.scrollEventCount++;
  }

  drainIntervalCounters() {
    const counts = {
      keyPresses: this.keyPressCount,
      mouseEvents: this.mouseEventCount,
      scrollEvents: this.scrollEventCount
    };
    this.keyPressCount = 0;
    this.mouseEventCount = 0;
    this.scrollEventCount = 0;
    return counts;
  }
}
```

---

## 4. Autonomous Lease Expiration & Agent Shutdown (Correction 4)

A disconnected agent must not be assumed stopped merely because the backend is disabled.

```javascript
// employee-agent-v2/src/managers/sessionLeaseManager.js
class SessionLeaseManager {
  constructor(inputCounter, syncEngine) {
    this.inputCounter = inputCounter;
    this.syncEngine = syncEngine;
    this.leaseExpiresAt = 0;
    this.autonomousExpiryTimer = null;
    this.MAX_AUTONOMOUS_GRACE_SECONDS = 90; // Absolute maximum unrenewed collection
  }

  updateLease(expiresInSeconds) {
    const now = Date.now();
    this.leaseExpiresAt = now + (expiresInSeconds * 1000);
    
    // Reset autonomous hardware expiry timer
    if (this.autonomousExpiryTimer) clearTimeout(this.autonomousExpiryTimer);
    
    this.autonomousExpiryTimer = setTimeout(() => {
      this.handleAutonomousExpiry();
    }, (expiresInSeconds + this.MAX_AUTONOMOUS_GRACE_SECONDS) * 1000);
  }

  handleAutonomousExpiry() {
    console.warn('⚠️ Lease expired without server renewal (Offline > 90s) — halting hooks autonomously');
    this.shutdownCollector('LEASE_EXPIRED');
  }

  handleServerRollbackCommand() {
    console.warn('🛑 Received ROLLBACK command from server — halting collection immediately');
    this.shutdownCollector('SERVER_ROLLBACK');
    this.syncEngine.purgeOfflineQueue(); // Drop revoked telemetry
  }

  shutdownCollector(reason) {
    // Verified local hook shutdown
    this.inputCounter.stop();
    if (this.autonomousExpiryTimer) clearTimeout(this.autonomousExpiryTimer);
    // Notify tray manager
    trayManager.updateStatus('DORMANT', reason);
  }
}
```

1. **Online Rollback:** Heartbeat response returns `403 FORBIDDEN: ROLLBACK`. Agent executes `shutdownCollector('SERVER_ROLLBACK')` and purges pending queue.
2. **Offline Rollback:** If the agent is disconnected when rollback occurs, its internal autonomous timer hits 90 seconds and calls `shutdownCollector('LEASE_EXPIRED')`. Input collection halts autonomously.

---

## 5. System Tray UI States & Controls

```
┌──────────────────────────────────────────────────────────┐
│  ● Monitored Work Active                                 │
│  Mode: Laptop/PC (MacBook Pro)                           │
│  Session: 03h 45m | Task: #TK-841                        │
├──────────────────────────────────────────────────────────┤
│  ⏸️  Pause for Break (Lunch, Personal Break)              │
│  🔄  Switch to Mobile / Other Device                     │
│  🛑  End Work Session                                    │
├──────────────────────────────────────────────────────────┤
│  🛡️  Privacy Transparency: Zero Keystrokes/Screenshots   │
│  ⚙️  Settings & Diagnostics                              │
│  ✕   Quit Agent (Suspends Telemetry)                     │
└──────────────────────────────────────────────────────────┘
```

- **Tray Badges:**
  - `● Active (Green)`: Normal telemetry flow.
  - `● Focused (Blue)`: Reading/debugging; low input cadence.
  - `● Paused (Amber)`: Break in progress.
  - `⚠️ Conflict (Amber)`: Legacy V1 agent running; V2 collector standing by.
  - `○ Dormant (Gray)`: Workday closed or rollback active.
