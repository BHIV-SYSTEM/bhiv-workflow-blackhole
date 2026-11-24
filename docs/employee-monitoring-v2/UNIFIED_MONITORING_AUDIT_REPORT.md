# NIYANTRAN UNIFIED EMPLOYEE MONITORING — REPOSITORY ARCHITECTURE AUDIT

**Audit Date:** November 19, 2026  
**Repository:** `BHIV-SYSTEM/bhiv-workflow-blackhole`  
**Branch:** `feature/employee-monitoring-v2-foundation`  
**PR:** https://github.com/BHIV-SYSTEM/bhiv-workflow-blackhole/pull/1  
**Status:** **AUDIT COMPLETED — GAP RESOLUTION IN PROGRESS**

---

## 1. Feature Inventory & Status Matrix

| Subsystem / Capability | V1 (Legacy) Status | V2 (Modern) Status | Unified Target Status | Findings & Gaps |
| :--- | :--- | :--- | :--- | :--- |
| **Foreground App Detection** | IMPLEMENTED (ActiveWin) | IMPLEMENTED (Win32 Helper) | **IMPLEMENTED** | V1 uses Electron + native addon; V2 uses lightweight C# helper (`NiyantranWin32Helper.exe`). Zero duplication in runtime. |
| **Usage Duration Measurement**| IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | V2 accurately tracks duration slices without double counting; halts on pause; flushes on end. |
| **Active / Idle Detection** | IMPLEMENTED (GetLastInputInfo) | IMPLEMENTED (GetLastInputInfo) | **IMPLEMENTED** | V2 accurately records hardware idle seconds without input hook injection. |
| **Keystroke Logging** | IMPLEMENTED (Character capture) | FORBIDDEN BY POLICY | **POLICY ENFORCED** | V1 collects typed text (50s cap); V2 Anti-Surveillance Gate strictly rejects all keystroke text (`keyPressCount` numeric only). |
| **Screenshots & OCR** | IMPLEMENTED (Cloudinary + OCR) | FORBIDDEN BY POLICY | **POLICY ENFORCED** | V1 takes periodic desktop captures; V2 Anti-Surveillance Gate rejects all image/base64 payloads. |
| **Device Enrollment & Pairing**| MISSING in V1 | IMPLEMENTED in V2 | **IMPLEMENTED** | 6-digit one-time PIN binding device to employee with DPAPI encrypted credentials. |
| **Credential Storage** | Plain text config in V1 | Windows DPAPI in V2 | **IMPLEMENTED** | V2 hardware-backed `CryptProtectData` LocalUser vault. |
| **Session Lease Management** | Indefinite / unbounded in V1 | 60s lease with auto-renewal | **IMPLEMENTED** | Server-enforced lease token; auto-stops upon expiry. |
| **PC Agent Health Detection** | PARTIAL (socket ping only) | MISSING in Web UI | **BRIDGING (P0)** | Web UI needs loopback detection to verify whether native agent is running before enabling session start. |
| **Agent Download & Install** | Manual script | NSIS script only | **BRIDGING (P0)** | Authenticated `/api/monitoring-v2/installer/download` endpoint and web prompt "Desktop Agent Required" needed. |
| **Employee Mini Desktop Window**| None (V1 opens web app) | PARTIAL (Tray balloon tip) | **BRIDGING (P0)** | Polished mini popup window with connection, mode, duration, app status, and pause/resume/end controls. |
| **PC $\leftrightarrow$ Mobile Handoff** | None | PARTIAL (Schema ready) | **BRIDGING (P0)** | Backend route exists; needs complete integration with agent stop, lease revocation, and mobile mode. |
| **Mobile Employee Workspace** | None | PARTIAL (Responsive layout) | **BRIDGING (P0)** | Mobile view for attendance check-in and session start without native app tracking claims. |
| **Admin Fleet Dashboards** | V1 Trinetra tabs | V2 Fleet & Live Team | **BRIDGING (P0)** | Connect frontend tabs directly to `monitoringV2Api` to eliminate mock data. |
| **Alerts & In-App Notifications**| V1 MonitoringAlert | PARTIAL (socket alerts) | **BRIDGING (P0)** | Add V2 alert types (`pc_mobile_switch`, `agent_disconnected`, etc.) to unified notification pipeline. |
| **Attendance Alignment** | Directly coupled in V1 | Read-only adapter in V2 | **IMPLEMENTED** | V2 respects attendance boundaries; sessions cannot alter raw attendance records. |

---

## 2. Identified Gaps, Broken Flows & Edge Cases

### Gap 1: Agent Pre-Session Detection (P0)
- **Problem:** When an employee opens the Web UI (`/monitoring-v2/employee`), the browser doesn't know if the Windows desktop agent is currently running.
- **Solution:** Desktop agent starts a lightweight HTTP loopback listener (`127.0.0.1:48120/status`). Web frontend pings this endpoint. If not running, web UI renders "Niyantran Desktop Agent Required" with one-click download.

### Gap 2: Authenticated Installer Delivery (P0)
- **Problem:** No standard API endpoint exists for downloading the packaged Windows agent.
- **Solution:** Add `GET /api/monitoring-v2/installer/download` serving the standalone setup package and installer script.

### Gap 3: Employee Mini Desktop Window (P0)
- **Problem:** Employees need a compact desktop window to see live status and control monitoring without opening the full web application.
- **Solution:** Deploy dual-surface mini window:
  1. Web popup route: `/monitoring-v2/mini-window` (`width=420,height=600`).
  2. Local loopback server route: `http://127.0.0.1:48120/mini` directly served by the agent daemon.

### Gap 4: PC $\leftrightarrow$ Mobile Session Orchestration (P0)
- **Problem:** Employees switching between workstation and phone need clean lease revocation, history tracking, and mobile interface switching.
- **Solution:** Implement `handoffService.js` handling:
  - Revoking active PC lease.
  - Setting session mode to `PHONE`.
  - Recording `handoff_history`.
  - Emitting Socket.io alert to employee and admin.
  - Halting desktop agent telemetry transmission.

### Gap 5: Admin Dashboard Real Data Binding (P0)
- **Problem:** Several V2 admin pages rely on `MockDataService` instead of `monitoringV2Api`.
- **Solution:** Bind `AdminDashboardPage.jsx`, `LiveTeamPage.jsx`, and `EmployeeActivityPage.jsx` to live backend data from MongoDB collections (`monitoring_v2_devices`, `monitoring_v2_sessions`, `monitoring_v2_telemetry`).

---

## 3. Unified Architecture Guarantees

```
[Unified Niyantran Employee Monitoring]
  ├── Legacy Operations (V1): Keystroke analysis & screenshot OCR (admin-only, strictly partitioned)
  └── Modern Privacy Operations (V2): 
        ├── Zero Screenshots / Zero Keystrokes / Zero URLs
        ├── Win32 Native Duration Tracking
        ├── Windows DPAPI Credential Vault
        ├── Server-Enforced Lease State Machine
        ├── PC/Mobile Session Orchestrator
        ├── Local Loopback Agent Health Detection (Port 48120)
        └── Polished Employee Mini Desktop Window
```
