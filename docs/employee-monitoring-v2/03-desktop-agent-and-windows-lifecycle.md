# Niyantran Employee Monitoring V2 — Desktop Agent & Windows Lifecycle

**Document ID:** NEM-V2-DOC-03  
**Version:** 2.0.0-PROD  
**Classification:** Native Windows Application Engineering Specification  
**System Working Directory:** `g:\Blackhole\Niyantran`  

---

## 1. Desktop Agent Architectural Overview

The Niyantran Employee Monitoring V2 Desktop Agent (`employee-agent-v2`) is engineered as a hybrid native Windows desktop application. It combines the high-level orchestration, networking, and IPC capabilities of Node.js with the raw performance and low-level OS interop of a compiled native C# (.NET Framework 4.8) Win32 helper executable (`bin/NiyantranWin32Helper.exe`).

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                   WINDOWS DESKTOP APPLICATION BOUNDARY                           │
│                                                                                  │
│   ┌────────────────────────────────┐       IPC Stdio Pipe (JSON)                 │
│   │ Node.js Desktop Orchestrator   │ ◄──────────────────────────────┐            │
│   │ - Lifecycle State Machine      │                                │            │
│   │ - HMAC-SHA256 Signer           │                                ▼            │
│   │ - Loopback Server (127.0.0.1)  │                     ┌────────────────────┐  │
│   │ - SQLite / JSON Offline Queue  │                     │ Native Win32 Helper│  │
│   └──────────────┬─────────────────┘                     │ (C# Executable)    │  │
│                  │                                       │                    │  │
│                  ▼                                       │ - QueryProcessName │  │
│   ┌────────────────────────────────┐                     │ - GetLastInputInfo │  │
│   │ Windows Forms NotifyIcon       │                     │ - Acer WMI/CIM     │  │
│   │ (Native Windows System Tray)   │                     └─────────┬──────────┘  │
│   └────────────────────────────────┘                               │             │
│                                                                    ▼             │
│                                                          ┌────────────────────┐  │
│                                                          │ Windows OS Kernel  │  │
│                                                          └────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Component Breakdown

1. **Native Win32 Helper (`bin/NiyantranWin32Helper.exe`)**:
   - Compiled C# Windows Forms / Win32 console application.
   - Executes process image extraction via `QueryFullProcessImageName` (zero window titles).
   - Monitors user hardware activity via `GetLastInputInfo` (inactivity seconds only).
   - Manages the native Windows Taskbar System Tray icon (`NotifyIcon`).
2. **Node.js Orchestrator (`src/daemon.js`, `src/agent.js`)**:
   - Spawns and supervises the native helper child process via stdio IPC.
   - Implements the 60-second renewable session lease state machine.
   - Computes HMAC-SHA256 cryptographic signatures over 1-minute telemetry aggregates.
   - Runs the secure loopback daemon on `127.0.0.1:48120` serving the standalone mini-window.
   - Manages local offline buffering and FIFO queue drain.

---

## 2. Windows Native Lifecycle Management

### 2.1 Installer Packaging & Distribution

The desktop agent installer is delivered as a signed self-extracting Windows executable:
- **Filename**: `NiyantranMonitoringAgentV2-Setup.exe`
- **Architecture**: Windows x64 (Compatible with Windows 10, Windows 11)
- **Installer Size**: 55,808 bytes
- **SHA-256 Checksum**:
  ```
  B104D7D8A13123CB70FBF65B209A3BBF92F6744BE7A2B0DFDC623B6ED6C91D47
  ```
- **Distribution API**: Served via authenticated endpoint:
  ```http
  GET /api/monitoring-v2/installer/download?format=exe HTTP/1.1
  Host: localhost:5000
  Authorization: Bearer <WorkflowToken>
  ```

### 2.2 SHA-256 Checksum Verification Procedure

To verify package authenticity on a Windows workstation prior to execution, run PowerShell:

```powershell
# Authenticate & Download
$headers = @{ "Authorization" = "Bearer $token" }
Invoke-RestMethod -Uri "http://localhost:5000/api/monitoring-v2/installer/download" -OutFile "NiyantranMonitoringAgentV2-Setup.exe" -Headers $headers

# Verify Cryptographic SHA-256 Hash
$expectedHash = "B104D7D8A13123CB70FBF65B209A3BBF92F6744BE7A2B0DFDC623B6ED6C91D47"
$actualHash = (Get-FileHash -Path "NiyantranMonitoringAgentV2-Setup.exe" -Algorithm SHA256).Hash.ToUpper()

if ($actualHash -eq $expectedHash) {
    Write-Host "✅ Cryptographic Verification PASSED: Binary matches authoritative build." -ForegroundColor Green
} else {
    Write-Error "❌ Verification FAILED: Checksum mismatch! Aborting installation."
}
```

### 2.3 System Shortcuts & Start Menu Integration

During setup, the installer establishes standard Windows shortcuts:
- **Start Menu**:
  `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Niyantran\Niyantran Monitoring Agent V2.lnk`
- **Desktop Shortcut**:
  `%USERPROFILE%\Desktop\Niyantran Monitoring Agent V2.lnk`
- **Target**:
  `%LOCALAPPDATA%\Programs\NiyantranMonitoringAgentV2\NiyantranMonitoringAgentV2.exe`

### 2.4 Custom Protocol Handler (`niyantran://`)

The installer registers a custom URL protocol scheme in the Windows Registry, enabling the web dashboard to launch or foreground the agent without browser security blocks:

```reg
[HKEY_CURRENT_USER\Software\Classes\niyantran]
@="URL:Niyantran Monitoring Protocol"
"URL Protocol"=""

[HKEY_CURRENT_USER\Software\Classes\niyantran\shell\open\command]
@="\"C:\\Users\\<User>\\AppData\\Local\\Programs\\NiyantranMonitoringAgentV2\\NiyantranMonitoringAgentV2.exe\" \"%1\""
```

Invoking `window.location.href = "niyantran://open"` from the web client instructs the Windows Shell to launch or foreground the native application.

---

## 3. Native Windows System Tray (`NotifyIcon`)

The desktop agent provides continuous ambient visibility via a native Windows Forms `NotifyIcon` residing in the taskbar notification area:

```
┌────────────────────────────────────────────────────────┐
│  Niyantran Monitoring Agent V2                         │
├────────────────────────────────────────────────────────┤
│  ● Status: Monitoring Active                           │
│  🏢 Mode: Acer Nitro AN515-57 Workstation              │
│  ⏱️ Active Workday: 03h 45m                            │
├────────────────────────────────────────────────────────┤
│  Open Employee Mini-Window                             │
│  Take Break (Pause Monitoring)                         │
│  Resume Monitoring                                     │
│  Privacy Disclosures & Disallowed Surveillance Info     │
├────────────────────────────────────────────────────────┤
│  Exit Agent                                            │
└────────────────────────────────────────────────────────┘
```

### 3.1 Tray Context Menu Actions

- **Open Employee Mini-Window**: Sends IPC command to daemon, opening or focusing the mini-window HTML interface.
- **Take Break (Pause Monitoring)**: Suspends process tracking, notifies backend, and transitions state to `PAUSED`.
- **Resume Monitoring**: Re-activates 60-second lease renewal and resumes process duration tracking.
- **Privacy Disclosures**: Opens local modal detailing exactly what telemetry is gathered (executable names, duration) and what is strictly excluded (keystrokes, titles, screens, URLs).
- **Exit Agent**: Gracefully flushes pending offline telemetry, shuts down background threads, unbinds port 48120, and terminates.

---

## 4. Acer Hardware Profiling via WMI/CIM

To ensure genuine device binding, the desktop agent inspects the underlying hardware via WMI/CIM queries on Windows:

```powershell
# PowerShell CIM Queries executed by wmiDetector.js
Get-CimInstance -ClassName Win32_ComputerSystem | Select-Object Manufacturer, Model
Get-CimInstance -ClassName Win32_ComputerSystemProduct | Select-Object IdentifyingNumber, UUID
```

### 4.1 Development Machine Hardware Signature

On the development test machine, the agent captures the following profile:

| Hardware Attribute | Captured Value | Persistence Field |
| :--- | :--- | :--- |
| **Manufacturer** | `Acer` | `RegisteredDevice.manufacturer` |
| **Model** | `Nitro AN515-57` | `RegisteredDevice.model` |
| **Device Name** | `Acer Nitro AN515-57 Workstation` | `RegisteredDevice.device_name` |
| **Platform** | `windows` | `RegisteredDevice.platform` |
| **Machine UUID** | Unique hardware GUID | `RegisteredDevice.machine_uuid` |

This hardware profile is displayed identically across both the Employee Mini-Window and the Admin Fleet Management console.

---

## 5. Employee Mini-Window & Loopback Daemon (`127.0.0.1:48120`)

The agent hosts an ultra-lightweight loopback HTTP daemon bound to `127.0.0.1:48120`:

### 5.1 Endpoints

- `GET /status`: Returns JSON health status, agent version, machine metadata, current foreground executable, active session ID, and lease expiration timestamp.
  ```json
  {
    "status": "ok",
    "agentVersion": "2.0.0",
    "deviceId": "v2_dev_acer_01",
    "manufacturer": "Acer",
    "model": "Nitro AN515-57",
    "sessionState": "ACTIVE",
    "currentApp": "code.exe",
    "currentCategory": "DEVELOPMENT",
    "activeSeconds": 3600,
    "hardwareIdleSeconds": 12,
    "leaseExpiresAt": "2026-11-21T04:30:00.000Z"
  }
  ```
- `GET /mini`: Delivers the standalone, self-contained Employee Mini-Window HTML/CSS/JS application.
- `POST /open`: Brings the native window to the foreground.
- `POST /session/start`: Initiates monitoring when workday is authorized.
- `POST /session/pause`: Pauses monitoring for breaks.
- `POST /session/resume`: Resumes monitoring.
- `POST /session/end`: Halts collection and initiates final telemetry flush.

---

## 6. Auto-Reconnection & Resilience Engine

```
       OFFLINE AUTO-RECONNECTION & TELEMETRY FLUSH FLOW
       
    [Network Connection Drops]
              │
              ▼
    Lease expires (60s) -> Enters 30s Grace Period
              │
              ▼
    Grace window elapses (90s) -> Halts Live API Transmission
              │
              ▼
    Incoming 1-minute telemetry enqueued into local Signed Offline Buffer
    (HMAC-SHA256 signed using device secret, max 120 minutes)
              │
              ▼
    [Network Connection Restored]
              │
              ▼
    Agent detects network via Socket.io heartbeat
              │
              ▼
    Renews active session lease with Backend API
              │
              ▼
    Flushes buffered samples in FIFO order (batches of 50)
              │
              ▼
    Buffer drained (0 items remaining), resumes live 60s cadence
```

### 6.1 Resilience Verification

The auto-reconnection and buffering engine has been verified under Tier 1 (`F6.autoReconnectionBuffer.test.js`), Tier 4 (`testG.autoReconnectionAndOfflineBuffer.test.js`), and Tier 5 (`adversarial.stress.test.js`), confirming:
1. 100% preservation of offline telemetry slices up to 120 minutes.
2. FIFO overflow discipline without memory leaks or application crashes.
3. Clean draining upon network reconnection with zero duplicate records.
