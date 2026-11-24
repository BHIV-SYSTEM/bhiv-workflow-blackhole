# Niyantran Employee Monitoring V2 — Architecture & Threat Model

**Document ID:** NEM-V2-DOC-01  
**Version:** 2.0.0-PROD  
**Classification:** Confidential — Engineering Architecture & Security Specification  
**System Working Directory:** `g:\Blackhole\Niyantran`  

---

## 1. Executive Summary & Architectural Vision

Niyantran Employee Monitoring V2 is a privacy-first, transparent, enterprise-grade attendance and activity monitoring platform engineered for modern hybrid workplaces. Traditional enterprise employee surveillance systems rely on invasive, covert monitoring vectors—such as raw keystroke logging, arbitrary screen captures, optical character recognition (OCR) of private displays, deep packet inspection of full URLs, and window-title logging. These legacy practices violate employee privacy, create severe regulatory compliance liabilities (GDPR, CCPA, Indian DPDP Act), and introduce devastating security vulnerabilities.

Niyantran V2 fundamentally excises invasive surveillance from the ground up, establishing an auditable, transparent paradigm centered around four immutable architectural pillars:

1. **Strict Hardware & Process Isolation**: Activity tracking is strictly restricted to top-level executable names obtained via the Windows `QueryFullProcessImageName` Win32 API. All window-title inspection (`GetWindowText`), raw text capture, keystroke hooks, screen captures, OCR analysis, and URL harvesting have been systematically and permanently excised.
2. **Cryptographic Integrity & BYOD Security**: Every desktop agent binds to a unique physical device profile identified through WMI/CIM hardware detection (e.g. Acer Nitro AN515-57). All telemetry packets are authenticated via HMAC-SHA256 signatures, validated against AES-256-GCM encrypted device secrets, protected by 120-second clock skew guards, and buffered locally in signed FIFO queues during network outages.
3. **Decoupled Workday Attendance & Autonomous Leases**: Workday attendance is decoupled from monitoring agent connectivity. Employees who start their workday retain accurate attendance records even if the desktop monitoring agent is offline or closed (status: `Disconnected / Not Monitored`). Active monitoring requires explicit authorization, granting short-lived renewable 60-second session leases with a 30-second autonomous timeout grace period.
4. **Deterministic & Explainable Activity Governance**: Covert algorithmic karma penalties and opaque heuristic scoring have been eradicated. In their place operates a deterministic, transparent alert engine with three tiers (White: Normal, Yellow: Attention, Red: Human Review Required). Browser executables alone are explicitly exempt from misconduct classification, and employees have a constitutional right to submit explanations before managerial review.

---

## 2. End-to-End System Topology & Subsystem Boundaries

The Niyantran V2 system comprises four distinct, decoupled subsystems communicating across rigorously enforced network and IPC boundaries:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT SUBSYSTEM (React 19 + Vite 6)                     │
│                                           Port 5173 (HTTP)                                  │
│  ┌───────────────────────┐   ┌────────────────────────┐   ┌──────────────────────────────┐  │
│  │ Authenticated UI      │   │ Enhanced Start Day     │   │ Live Team / Reports          │  │
│  │ (Download / Open)     │   │ (Explicit Consent)     │   │ (Real MongoDB & Socket.io)   │  │
│  └───────────┬───────────┘   └───────────┬────────────┘   └──────────────┬───────────────┘  │
└──────────────┼───────────────────────────┼───────────────────────────────┼──────────────────┘
               │                           │                               │
               │ Custom Protocol           │ REST / JSON                   │ Real-time Events
               │ niyantran://open          │ /api/attendance/*             │ /socket.io (Vite Proxy)
               ▼                           ▼                               ▼
┌──────────────────────────────┐ ┌────────────────────────────────────────────────────────────┐
│   WINDOWS DESKTOP AGENT      │ │              BACKEND APPLICATION SERVER                   │
│   (employee-agent-v2)        │ │                 (Node.js / Express 5.1)                    │
│   Port 48120 (Loopback Only) │ │                    Port 5000 (HTTP)                        │
│  ┌────────────────────────┐  │ │  ┌───────────────────────┐    ┌─────────────────────────┐  │
│  │ Node.js Daemon         │  │ │  │ Monitoring V2 Routes  │    │ Attendance Lifecycle    │  │
│  │ (127.0.0.1:48120)      │  │ │  │ (/api/monitoring-v2)  │    │ (/api/attendance/*)     │  │
│  └───────────┬────────────┘  │ │  └───────────┬───────────┘    └────────────┬────────────┘  │
│              │ IPC Pipe      │ │              │                             │               │
│              ▼               │ │              ▼                             ▼               │
│  ┌────────────────────────┐  │ │  ┌───────────────────────┐    ┌─────────────────────────┐  │
│  │ NiyantranWin32Helper   │  │ │  │ Anti-Surveillance Gate│    │ Trinetra Explainable    │  │
│  │ (C# Native Executable) │  │ │  │ & HMAC Verification   │    │ Alert Engine (W/Y/R)    │  │
│  └───────────┬────────────┘  │ │  └───────────┬───────────┘    └────────────┬────────────┘  │
│              │ Win32 API     │ └──────────────┼─────────────────────────────┼───────────────┘
│              ▼               │                │                             │
│  ┌────────────────────────┐  │                ▼                             ▼
│  │ Windows OS Kernel      │  │ ┌────────────────────────────────────────────────────────────┐
│  │ - QueryFullProcessName │  │ │                     PERSISTENCE LAYER                      │
│  │ - GetLastInputInfo     │  │ │               MongoDB v7.0 (Port 27017)                    │
│  │ - WMI / CIM Hardware   │  │ │  - users / attendances / dailyattendances                  │
│  │ - System Tray (WinForm)│  │ │  - monitoring_v2_sessions / monitoring_v2_telemetry        │
│  └────────────────────────┘  │ │  - registered_devices / monitoringalerts                   │
└──────────────────────────────┘ └────────────────────────────────────────────────────────────┘
```

### 2.1 Subsystem Specifications

| Subsystem | Technology Stack | Network Binding | Primary Responsibilities |
| :--- | :--- | :--- | :--- |
| **Desktop Agent** | Node.js v24.14.0 + C# (.NET Framework 4.8) | `127.0.0.1:48120` | Native Windows tray (`NotifyIcon`), Start Menu shortcut, URI protocol (`niyantran://`), WMI hardware profiling, process image extraction, numeric input counting, signed offline HMAC buffer. |
| **Backend API** | Node.js v24.14.0 + Express 5.1 | `0.0.0.0:5000` | REST API routing, JWT auth, device enrollment, HMAC verification, 60s lease state machine, anti-surveillance schema filtering, explainable alert generation, automated daily report compilation. |
| **Frontend Client**| React 19, Vite 6, Tailwind CSS | `0.0.0.0:5173` | Authenticated employee & admin dashboard, explicit authorization modal, Live Team real-time monitoring, alert review & employee explanation workflows, verified agent download. |
| **Database** | MongoDB 7.0 | `127.0.0.1:27017` | Persistent storage across collections: `users`, `attendances`, `dailyattendances`, `monitoring_v2_sessions`, `monitoring_v2_telemetry`, `registered_devices`, `monitoringalerts`. |

---

## 3. Threat Model Analysis (STRIDE)

A comprehensive STRIDE threat modeling assessment was executed against the Niyantran Employee Monitoring V2 system to identify, classify, and mitigate potential security and privacy vulnerabilities across all interfaces.

```
       STRIDE THREAT MODEL BOUNDARY MATRIX
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                                                                  │
│   [UNTRUSTED EXTERNAL NETWORK]                                                   │
│               │                                                                  │
│               ▼                                                                  │
│   ┌──────────────────────────────────────────────┐                               │
│   │ THREAT: Spoofing & Replay                    │                               │
│   │ MITIGATION: HMAC-SHA256 + 120s Clock Skew    │                               │
│   └──────────────────────┬───────────────────────┘                               │
│                          │                                                       │
│   [REST API BOUNDARY (Port 5000)]                                                │
│                          │                                                       │
│   ┌──────────────────────▼───────────────────────┐                               │
│   │ THREAT: Tampering & Surveillance Smuggling   │                               │
│   │ MITIGATION: Anti-Surveillance Gate Contract  │                               │
│   └──────────────────────┬───────────────────────┘                               │
│                          │                                                       │
│   [PROCESS & IPC BOUNDARY]                                                       │
│                          │                                                       │
│   ┌──────────────────────▼───────────────────────┐                               │
│   │ THREAT: Information Disclosure via Loopback  │                               │
│   │ MITIGATION: 127.0.0.1 Binding + CORS Block  │                               │
│   └──────────────────────────────────────────────┘                               │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Detailed STRIDE Threat & Mitigation Matrix

| Threat Category | Threat Vector | Target Subsystem | Severity | Implemented Architectural Mitigation | Verification Evidence |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **Spoofing** | Attacker impersonates a legitimate employee device to inject fraudulent active telemetry. | Ingestion API (`/api/monitoring-v2/telemetry`) | **HIGH** | Every device generates an enrollment pairing code. A 64-character cryptographic device secret is issued, stored AES-256-GCM encrypted in MongoDB, and held locally by the agent. Telemetry must supply `X-Device-Id`, `X-Timestamp`, and `X-Device-Signature` (`HMAC-SHA256(canonical, secret)`). Unregistered or mismatched devices are rejected with HTTP 403 `DEVICE_NOT_FOUND`. | Tier 1: `F1.installerDownload.test.js`<br>Tier 5: `adversarial.stress.test.js` |
| **Tampering** | Man-in-the-Middle (MitM) or local agent manipulation modifies payload metrics (e.g. inflating active time or forging process category). | Telemetry Ingestion Pipeline | **HIGH** | The raw stringified JSON body is bound directly to the HMAC signature: `canonical = "${timestamp}:${rawBody}"`. Any bit-flip in the payload string or signature string invalidates `crypto.timingSafeEqual`, throwing HTTP 401 `INVALID_SIGNATURE`. | Tier 5: `adversarial.stress.test.js` (Bit-flip body & sig tests) |
| **Repudiation** | An employee claims unauthorized monitoring took place, or management claims an employee was inactive without evidence. | Workday Lifecycle & Audit System | **MEDIUM** | Explicit employee consent is captured at Start Day (`monitoringConsent: true`) and logged to MongoDB. All device enrollments, revocations, session starts, pauses, and handoffs generate immutable records in `DeviceAuditLog`. Telemetry records preserve raw timestamps and minute hashes. | Tier 1: `F10.workdayAttendanceSync.test.js`<br>Tier 3: `combo.workdayAndAgentLease.test.js` |
| **Information Disclosure** | External processes or rogue network hosts query the agent daemon to discover user activity. | Agent Loopback Daemon (`127.0.0.1:48120`) | **CRITICAL** | The HTTP server strictly binds to loopback interface `127.0.0.1` (refusing `0.0.0.0`). Browser requests from foreign origins are blocked by CORS policies. The loopback API exposes zero sensitive strings—window titles, URLs, and keystrokes do not exist in agent memory. | Tier 1: `F2.openAgentLauncher.test.js`<br>Tier 2: `F2.boundary.launcher.test.js` |
| **Information Disclosure** | Rogue agent injects keystrokes, window titles, or URLs into telemetry payloads to bypass privacy policy. | Backend Ingestion & Database | **CRITICAL** | **Anti-Surveillance Gate (`validateTelemetrySample`)**: Strictly rejects any sample containing `text`, `keystrokes`, `screenshot`, `image`, `base64`, `clipboard`, `url`, `windowTitle`, or `tabTitle`. App arrays are strictly validated; forbidden attributes trigger immediate HTTP 400 `PRIVACY_VIOLATION`. | Tier 1: `F5.agentPrivacyEnforcement.test.js`<br>Tier 5: `adversarial.stress.test.js` (Smuggling tests) |
| **Denial of Service** | Agent floods server with rapid telemetry or offline buffer dumps, overwhelming backend I/O. | Ingestion API & Network | **MEDIUM** | Ingestion rate limited to 12 requests per minute per device. Offline sync utilizes batched transactions (`OFFLINE_SYNC_BATCH_SIZE: 50`). Local disk buffer enforces a strict FIFO ceiling of 120 minutes (500 samples), evicting oldest records without crashing. | Tier 2: `F6.boundary.leaseTimeoutBuffer.test.js`<br>Tier 5: `adversarial.stress.test.js` (Buffer limit tests) |
| **Elevation of Privilege** | Standard employee submits administrative resolution or clears alerts without authorization. | Alerts API (`/api/alerts/:alertId/resolve`) | **HIGH** | Strict role-based middleware (`v2Auth`, `adminAuth`) prevents non-admin users from invoking managerial resolution. Employees are restricted to `/explain` endpoints matching their own `employeeId`. | Tier 2: `F9.boundary.explanationSecurity.test.js` |

---

## 4. Privacy-Preserving Process Tracking via `QueryFullProcessImageName`

The fundamental security and privacy achievement in Niyantran V2 is the complete decoupling of process tracking from window-title and input snooping.

### 4.1 Win32 Native Helper Implementation

In legacy surveillance tools, window tracking is implemented via `GetForegroundWindow` followed by `GetWindowTextW`. Because browser and editor window titles contain highly sensitive personal and proprietary information (e.g. *"Bank Login - Google Chrome"*, *"Private Medical Report - Word"*, *"Patient Records - Edge"*), `GetWindowTextW` is a severe surveillance liability.

Niyantran V2 replaces this mechanism entirely in `NiyantranWin32Helper.cs` using `QueryFullProcessImageNameW`:

```csharp
// Windows Win32 Native Interop — NiyantranWin32Helper.cs
[DllImport("user32.dll")]
private static extern IntPtr GetForegroundWindow();

[DllImport("user32.dll", SetLastError = true)]
private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

[DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
private static extern bool QueryFullProcessImageName(
    IntPtr hProcess,
    uint dwFlags,
    [Out] StringBuilder lpExeName,
    ref uint lpdwSize);

public static ProcessInfo GetActiveProcess()
{
    IntPtr hWnd = GetForegroundWindow();
    if (hWnd == IntPtr.Zero) return ProcessInfo.Empty;

    uint pid;
    GetWindowThreadProcessId(hWnd, out pid);

    IntPtr hProcess = OpenProcess(
        ProcessAccessFlags.QueryLimitedInformation, 
        false, 
        pid);

    if (hProcess == IntPtr.Zero) return ProcessInfo.FromPid(pid);

    try
    {
        uint capacity = 1024;
        StringBuilder sb = new StringBuilder((int)capacity);
        if (QueryFullProcessImageName(hProcess, 0, sb, ref capacity))
        {
            string fullPath = sb.ToString();
            string executable = Path.GetFileName(fullPath).ToLowerInvariant();
            
            // Returns ONLY sanitized executable filename (e.g. "code.exe", "chrome.exe")
            // ZERO window titles, ZERO parameters, ZERO URLs
            return new ProcessInfo { Executable = executable, Pid = pid };
        }
    }
    finally
    {
        CloseHandle(hProcess);
    }
    return ProcessInfo.Empty;
}
```

### 4.2 Hardware Idle Tracking via `GetLastInputInfo`

Input activity monitoring is similarly stripped of all surveillance vectors:
- **No Keystroke Hooks (`WH_KEYBOARD_LL`)**: The agent cannot capture which keys were typed, words entered, or passwords submitted.
- **Hardware Idle Only**: The agent calls `GetLastInputInfo` to calculate system-wide inactivity elapsed time:
  $$\text{idleSeconds} = \frac{\text{GetTickCount}() - \text{plii.dwTime}}{1000}$$
- **Numeric Aggregation**: Over each 60-second slice, the agent tracks only non-sensitive numeric deltas: `keyPressCount` (integer total), `mouseActivityDelta` (integer total), and `hardwareIdleSeconds` (integer elapsed).

---

## 5. Session Lease State Machine & Autonomous Timeout

Niyantran V2 eliminates orphan sessions and zombie monitoring through a strict, renewable cryptographic lease engine.

```
       SESSION LEASE STATE MACHINE & AUTONOMOUS TIMEOUT
       
    [Start Day + Consent]
              │
              ▼
       ┌──────────────┐      Heartbeat Renew (every 30s)
       │    ACTIVE    │ ◄─────────────────────────────────┐
       └──────┬───────┘                                   │
              │                                           │
         Lease Expires (60s)                              │
              │                                           │
              ▼                                           │
       ┌──────────────┐       Renew Lease                 │
       │ GRACE PERIOD │ ──────────────────────────────────┘
       │  (30s Grace) │
       └──────┬───────┘
              │
     Grace Window Exceeded (90s total)
              │
              ▼
       ┌──────────────┐
       │ AUTONOMOUS   │ ──► Halts telemetry collection locally
       │   TIMEOUT    │ ──► Enqueues to Signed Offline Buffer
       └──────────────┘ ──► Attendance remains "Present (Disconnected)"
```

### 5.1 Lease Timing Parameters

- **Lease Duration**: 60 seconds (`SESSION_LEASE_SECONDS: 60`).
- **Heartbeat Renewal Cadence**: Agent sends renewal requests every 30 seconds.
- **Autonomous Grace Window**: 30 seconds (`AUTONOMOUS_EXPIRY_GRACE_SECONDS: 30`).
- **Autonomous Expiration Boundary**: $60\text{s} + 30\text{s} = 90\text{s}$. If no renewal is received within 90 seconds, the agent autonomously halts live submission, marks the connection `Disconnected / Not Monitored`, and diverts telemetry to the local HMAC-signed buffer.

---

## 6. Offline Buffering & FIFO Reconnection Synchronization

When an employee experiences network interruptions, VPN disconnects, or local router outages, Niyantran V2 guarantees zero data loss without violating storage boundaries:

1. **Local Signed Storage**: Telemetry slices are formatted, hashed, and stored in the local SQLite/JSON queue (`offlineQueue`).
2. **Buffer Capacity Bounds**: Capped at 120 minutes / 500 samples (`MAX_OFFLINE_BUFFER_SAMPLES: 500`).
3. **FIFO Overflow Discipline**: When the 121st minute arrives without network restoration, the queue safely shifts out the oldest record ($O(1)$ FIFO eviction), preventing buffer overflows or local disk exhaustion.
4. **Resumption & Drain**: Upon network restoration, the agent reconnects via Socket.io, negotiates a fresh session lease, and flushes buffered slices in atomic batches of 50 (`OFFLINE_SYNC_BATCH_SIZE: 50`) using chronological order.

---

## 7. Loopback Security & URI Protocol Specification

### 7.1 Loopback Daemon Security (`127.0.0.1:48120`)

The desktop agent provides an HTTP daemon to serve the employee mini-window and accept local dashboard commands. Security is enforced through:
- **Interface Binding**: Explicitly bound to `127.0.0.1`. Attempts to bind to external interfaces (`0.0.0.0` or public LAN IPs) are rejected at startup.
- **CORS Protection**: Access-Control-Allow-Origin headers strictly validate against `http://localhost:5173` and `http://127.0.0.1:5173`. Arbitrary external domains cannot issue cross-origin requests to the loopback daemon.
- **Port Fallback**: If port 48120 is occupied, the agent probes sequentially up to 48130, logging the assigned port in the Windows Registry for client auto-discovery.

### 7.2 Custom URI Scheme (`niyantran://`)

The desktop installer registers the `niyantran://` protocol handler in the Windows Registry under `HKEY_CURRENT_USER\Software\Classes\niyantran`:

```reg
Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\Software\Classes\niyantran]
@="URL:Niyantran Desktop Agent Protocol"
"URL Protocol"=""

[HKEY_CURRENT_USER\Software\Classes\niyantran\shell\open\command]
@="\"C:\\Users\\<User>\\AppData\\Local\\Programs\\NiyantranMonitoringAgentV2\\NiyantranMonitoringAgentV2.exe\" \"%1\""
```

Invoking `niyantran://open` from the authenticated web dashboard invokes the Windows Shell, bringing the agent mini-window to the foreground without requiring elevated administrative privileges.
