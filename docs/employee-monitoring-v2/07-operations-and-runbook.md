# Niyantran Employee Monitoring V2 — Operations & Runbook

**Document ID:** NEM-V2-DOC-07  
**Version:** 2.0.0-PROD  
**Classification:** DevOps, Site Reliability & Operations Runbook  
**System Working Directory:** `g:\Blackhole\Niyantran`  

---

## 1. Operational Architecture & Service Matrix

Niyantran Employee Monitoring V2 relies on four interconnected local services operating in coordinated harmony:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           OPERATIONAL SERVICE PORT MATRIX                               │
├───────────────────┬──────────┬───────────────┬──────────────────────────────────────────┤
│ Service Name      │ Port     │ Interface     │ Protocol / Function                      │
├───────────────────┼──────────┼───────────────┼──────────────────────────────────────────┤
│ MongoDB Database  │ 27017    │ 127.0.0.1     │ MongoDB Wire Protocol (v7.0)             │
│ Express API       │ 5000     │ 0.0.0.0       │ HTTP / REST API & Socket.io Engine       │
│ Vite Frontend     │ 5173     │ 0.0.0.0       │ HTTP / Single-Page Application (React 19)│
│ Agent Loopback    │ 48120    │ 127.0.0.1     │ HTTP / Loopback Daemon & Mini-Window UI  │
└───────────────────┴──────────┴───────────────┴──────────────────────────────────────────┘
```

---

## 2. Preflight Health Validation

Before launching test suites or starting production shifts, administrators and engineers should run the automated preflight probe.

### 2.1 Preflight Probe Command

```powershell
cd g:\Blackhole\Niyantran
node tests/e2e/runner.js --preflight-only
```

### 2.2 Expected Preflight Output (All Services Active)

```
Checking subsystem service ports...

┌──────────────────────────────┬──────────────┬──────────────┬──────────────┬──────────────────────────────┐
│ Service Name                 │ Target       │ Status       │      Latency │ Note                         │
├──────────────────────────────┼──────────────┼──────────────┼──────────────┼──────────────────────────────┤
│ MongoDB Database             │ 127.0.0.1:27017 │ ONLINE    │          2ms │ Port Open                    │
│ Express Backend API          │ 127.0.0.1:5000  │ ONLINE    │          4ms │ HTTP 200 OK                  │
│ Vite Frontend Client         │ 127.0.0.1:5173  │ ONLINE    │          5ms │ HTTP 200 OK                  │
│ Desktop Agent Loopback       │ 127.0.0.1:48120 │ ONLINE    │          3ms │ Loopback Status OK           │
└──────────────────────────────┴──────────────┴──────────────┴──────────────┴──────────────────────────────┘

Preflight probe complete.
```

### 2.3 Strict Preflight Enforcement

To guarantee test execution aborts immediately if core database services are offline:

```powershell
node tests/e2e/runner.js --strict-preflight
# Exits with Code 2 if MongoDB is unavailable
```

---

## 3. Service Lifecycle & Startup Procedures

Services MUST be started in chronological dependency order:
1. **MongoDB Database** (Port 27017)
2. **Express Backend API** (Port 5000)
3. **Vite Frontend Client** (Port 5173)
4. **Desktop Agent Application** (Port 48120)

### 3.1 Step 1: Start MongoDB Database

Ensure MongoDB service is running locally on Windows:

```powershell
# Verify Windows Service
Get-Service -Name MongoDB

# If stopped, start service
Start-Service -Name MongoDB

# Manual executable launch fallback
mongod --dbpath "C:\data\db" --port 27017
```

### 3.2 Step 2: Start Express Backend API

```powershell
cd g:\Blackhole\Niyantran\server

# Set mandatory environment variables
$env:PORT = "5000"
$env:NODE_ENV = "development"
$env:MONGODB_URI = "mongodb://localhost:27017/niyantran"
$env:JWT_SECRET = "niyantran-prod-jwt-7f3a9c2e8b1d4g6h0k5m8p2q9s3v6x1z"
$env:ENABLE_MONITORING_V2 = "true"
$env:ENABLE_MONITORING_V2_INGESTION = "true"
$env:ENABLE_MONITORING_V2_ADMIN_UI = "true"
$env:ENABLE_MONITORING_V2_EMPLOYEE_UI = "true"

# Launch Backend
npm start
# Server listens on http://localhost:5000
```

### 3.3 Step 3: Start Vite Frontend Client

```powershell
cd g:\Blackhole\Niyantran\client

# Launch Vite Dev Server with Proxy
npm run dev
# Frontend accessible at http://localhost:5173
```

### 3.4 Step 4: Launch Windows Desktop Agent

```powershell
cd g:\Blackhole\Niyantran\employee-agent-v2

# Launch Desktop Agent Orchestrator
npm start
# Agent binds loopback to http://127.0.0.1:48120 and shows System Tray icon
```

---

## 4. Graceful Shutdown & Stopping Procedures

### 4.1 Stopping the Desktop Agent

- **Via Tray Menu**: Right-click the Niyantran taskbar icon and select **Exit Agent**.
- **Via PowerShell (Process Termination)**:
  ```powershell
  Stop-Process -Name "NiyantranMonitoringAgentV2" -Force -ErrorAction SilentlyContinue
  Stop-Process -Name "NiyantranWin32Helper" -Force -ErrorAction SilentlyContinue
  ```

### 4.2 Stopping Web & API Services

```powershell
# Terminate Node processes bound to ports 5000 and 5173
Get-Process -Id (Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue).OwningProcess | Stop-Process -Force
Get-Process -Id (Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue).OwningProcess | Stop-Process -Force
```

---

## 5. Clean Desktop Agent Uninstallation

When upgrading or decommissioning a workstation, execute the following clean removal protocol:

### 5.1 Automated Uninstallation

1. Open **Windows Settings** -> **Apps** -> **Installed apps**.
2. Select **Niyantran Monitoring Agent V2** -> **Uninstall**.
3. Follow the uninstaller prompts.

### 5.2 Manual Residual Cleanup Procedure

If performing manual decommissioning:

```powershell
# 1. Terminate running processes
Stop-Process -Name "NiyantranMonitoringAgentV2" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "NiyantranWin32Helper" -Force -ErrorAction SilentlyContinue

# 2. Delete application program files
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\Programs\NiyantranMonitoringAgentV2" -ErrorAction SilentlyContinue

# 3. Delete user configuration and offline queues
Remove-Item -Recurse -Force "$env:APPDATA\Niyantran" -ErrorAction SilentlyContinue

# 4. Remove Start Menu and Desktop shortcuts
Remove-Item -Force "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Niyantran" -Recurse -ErrorAction SilentlyContinue
Remove-Item -Force "$env:USERPROFILE\Desktop\Niyantran Monitoring Agent V2.lnk" -ErrorAction SilentlyContinue

# 5. Remove Windows Registry URI Protocol Scheme
Remove-Item -Recurse -Force "HKCU:\Software\Classes\niyantran" -ErrorAction SilentlyContinue

Write-Host "✅ Clean uninstallation complete. System restored to baseline." -ForegroundColor Green
```

---

## 6. Operations Troubleshooting Matrix

| Issue Symptom | Probable Cause | Diagnostic Command | Remediation Action |
| :--- | :--- | :--- | :--- |
| **Port 5000 or 5173 Already in Use** | Orphaned Node process from prior run holding port. | `Get-NetTCPConnection -LocalPort 5000` | Identify PID and terminate: `Stop-Process -Id <PID> -Force` |
| **Port 48120 Blocked** | Prior agent crash or background zombie process. | `Get-NetTCPConnection -LocalPort 48120` | Terminate helper: `Stop-Process -Name "NiyantranWin32Helper" -Force`. Agent will auto-bind to 48120. |
| **`CLOCK_SKEW_REJECTED` (HTTP 400)** | Workstation system clock has drifted >120s from server time. | `w32tm /query /status` | Force resync system time: `w32tm /resync` |
| **Installer Hash Mismatch** | Binary corrupted during download or network proxy alteration. | `Get-FileHash -Path "NiyantranMonitoringAgentV2-Setup.exe" -Algorithm SHA256` | Re-download executable directly; confirm hash matches: `B104D7D8A13123CB70FBF65B209A3BBF92F6744BE7A2B0DFDC623B6ED6C91D47` |
| **Agent Shows "Disconnected / Not Monitored"** | Workday started, but monitoring agent is closed or lease renewal failed. | Query loopback: `Invoke-RestMethod http://127.0.0.1:48120/status` | Click **Open Agent** in dashboard, or launch from Start Menu. Attendance remains recorded. |
| **WebSocket Connection Drops in Vite** | Proxy configuration missing `ws: true` for Socket.io. | Inspect browser DevTools Network tab for `/socket.io` WebSocket upgrades. | Verify `client/vite.config.js` includes `/socket.io: { target: '...', ws: true }`. |

---

## 7. Operational Health Checklist

Before signing off on daily operations:
- [x] MongoDB database verified running on port 27017.
- [x] Backend API responding on `http://localhost:5000/api/monitoring-v2/installer/info`.
- [x] Vite frontend accessible on `http://localhost:5173`.
- [x] Agent loopback responding on `http://127.0.0.1:48120/status`.
- [x] E2E canonical suite passes with exit code 0 (`node tests/e2e/runner.js`).
- [x] Zero unhandled promise rejections or database leaks in server logs.
