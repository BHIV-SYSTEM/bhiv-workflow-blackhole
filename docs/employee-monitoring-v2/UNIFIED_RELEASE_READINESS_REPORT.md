# NIYANTRAN UNIFIED EMPLOYEE MONITORING: PRODUCTION READINESS & RELEASE REPORT

**Date:** November 19, 2026  
**Repository:** `BHIV-SYSTEM/bhiv-workflow-blackhole`  
**Branch:** `feature/employee-monitoring-v2-foundation`  
**Pull Request:** [#1 — feature/employee-monitoring-v2-foundation](https://github.com/BHIV-SYSTEM/bhiv-workflow-blackhole/pull/1)  
**Synchronized Remote Commit:** `766b22af4ff7653f1eb38ed3bf607a21a318cecf` (Ashmit Pandey)  
**Overall Release Gate Status:** **READY FOR CONTROLLED PILOT / GATED STAGING (257/257 TESTS PASSING)**

---

## 1. Executive Summary & Mission Fulfillment

On November 19, 2026, the unified Niyantran Employee Monitoring V1 and V2 system was finalized, integrated, and verified into a single, cohesive, privacy-first, enterprise-grade architecture.

### Key Objectives Delivered Today:
1. **Safe Teammate Branch Synchronization:**
   - Synchronized local repository with remote commit `766b22a`.
   - Verified zero file overlap and created disaster recovery branch (`backup/pre-sync-phase-c-f`) and disk backup archive (`v2_backup_archive_20261119_sync`).
2. **Local Loopback Desktop Agent Server:**
   - Deployed high-performance HTTP loopback server on `127.0.0.1:48120` inside the Windows Desktop Agent.
   - Provides real-time health telemetry (`GET /status`), CORS headers for web client detection, session control triggers (`POST /session/*`), and standalone mini window serving (`GET /mini`).
3. **Seamless Web UI PC Agent Installation & Detection:**
   - Implemented `useAgentDetection` hook in React frontend with continuous heartbeat polling against `127.0.0.1:48120`.
   - Dynamic UI displays "Niyantran Desktop Agent Required" card when agent is missing, with one-click installer download and connection retry.
   - Built authenticated backend installer route `GET /api/monitoring-v2/installer/download` and metadata route `GET /api/monitoring-v2/installer/info`.
4. **Employee Mini Desktop Window (Dual-Mode):**
   - Implemented dedicated floating React mini window at route `/monitoring-v2/mini-window`.
   - Implemented native HTML/JS lightweight mini window served directly by the loopback agent at `http://127.0.0.1:48120/mini`.
   - Visualizes live duration counter, active/idle status, active foreground process name & category, device mode, and controls (Start, Pause, Resume, End).
5. **Cross-Device Session Orchestrator (PC $\leftrightarrow$ Mobile Handoff):**
   - Built `handoffService.js` and mounted `POST /api/monitoring-v2/sessions/:sessionId/handoff`.
   - Enforces the Single Active Lease Rule: previous device lease is instantly revoked upon handoff, target device receives fresh 60s lease, and immutable handoff history is appended to `MonitoringSessionV2`.
   - Dispatches real-time alerts and Socket.io events (`monitoring:handoff`, `monitoring:session-state`, `monitoring-alert`).
6. **Live Admin & Employee Backend Integration:**
   - Connected `AdminDashboardPage.jsx` and `LiveTeamPage.jsx` directly to `monitoringV2Api.getLiveTeam()` and `/admin/summary`.
   - Connected `MonitoringV2Context.jsx` to real session endpoints (`getCurrentSession`, `startSession`, `pauseSession`, `resumeSession`, `endSession`).
   - Retained seamless offline fallback for local isolated demo and testing.
7. **Comprehensive Verification & Live Demonstration:**
   - **257 of 257** automated tests passing across all suites (Backend V2, Agent, Server Native, Server Jest, Frontend).
   - Client production build completed in **32.95s** with **0 ESLint errors**.
   - One-command live demo launcher (`scripts/demo-monitoring-v2.ps1 -AutoRecord -NoBrowser`) verified all 10 transaction phases directly in MongoDB.
   - High-fidelity 1080p demonstration video generated at `docs/employee-monitoring-v2/demo-videos/NIYANTRAN_V2_FULL_LIVE_DEMO.mp4`.

---

## 2. Architecture & Coexistence Matrix

| Dimension | Employee Monitoring V1 (Legacy) | Employee Monitoring V2 (Privacy-First) | Unified Governance Strategy |
| :--- | :--- | :--- | :--- |
| **Technology** | Electron (`employee-agent/`) | Native Win32 + Node (`employee-agent-v2/`) | Isolated directories; separate launchers. |
| **Data Ingestion** | Full screenshots, raw keystrokes, active URLs | Win32 foreground app duration, active/idle seconds | Strict anti-surveillance gate rejects V1 data in V2. |
| **Credential Storage** | Plaintext config files | Windows DPAPI Protected Data Vault | OS-level encryption bound to user logon session. |
| **Session Control** | Long-running unverified processes | 60-second cryptographically verified leases | Server rejects telemetry without active lease. |
| **Conflict Handling** | May conflict if running together | `AgentConflictDetector` passive process scan | V2 enters `V1_AGENT_CONFLICT` without killing V1. |
| **Cross-Device** | PC Only | PC $\leftrightarrow$ Mobile Phone Handoff | Single active lease enforced across devices. |
| **Feature Flags** | Standard Niyantran production | `ENABLE_MONITORING_V2=false` (Default OFF) | Zero production exposure until explicit release. |

---

## 3. Detailed Component Verification

### A. Windows Desktop Agent V2 & Loopback Server
- **Path:** [`employee-agent-v2/src/agent.js`](file:///g:/Blackhole/Niyantran/employee-agent-v2/src/agent.js)
- **Loopback Server:** [`employee-agent-v2/src/server/localAgentServer.js`](file:///g:/Blackhole/Niyantran/employee-agent-v2/src/server/localAgentServer.js)
- **Port:** `127.0.0.1:48120` (Strict loopback only)
- **Capabilities Verified:**
  - `GET /status`: Returns JSON payload with health, version, device ID, active app name, category, and idle seconds.
  - `GET /mini`: Serves interactive standalone HTML mini desktop window.
  - `POST /session/start`, `/pause`, `/resume`, `/end`: Controls local agent tracking.
  - Graceful `EADDRINUSE` handling when multiple instances are started.

### B. Authenticated Installer & Agent Distribution
- **Route:** `GET /api/monitoring-v2/installer/download`
- **Controller:** [`server/modules/employee-monitoring-v2/routes/installer.js`](file:///g:/Blackhole/Niyantran/server/modules/employee-monitoring-v2/routes/installer.js)
- **Installer Package:** `employee-agent-v2/dist/Niyantran-Agent-V2-Setup.zip` (33.8 KB)
- **Contents:**
  - Compiled helper: `bin/NiyantranWin32Helper.exe`
  - Agent source: `src/` (agent orchestrator, win32 monitor, DPAPI store, loopback server)
  - Windows PowerShell setup script: `install-agent.ps1`
  - Uninstaller script: `uninstall-agent.ps1`
- **Security:** Protected by `v2Auth` middleware; only authenticated employees/admins can download.

### C. Cross-Device Session Orchestrator
- **Service:** [`server/modules/employee-monitoring-v2/services/handoffService.js`](file:///g:/Blackhole/Niyantran/server/modules/employee-monitoring-v2/services/handoffService.js)
- **Endpoint:** `POST /api/monitoring-v2/sessions/:sessionId/handoff`
- **Validation & Governance Rules:**
  - Validates `targetMode` (`PHONE` or `LAPTOP_PC`).
  - If `LAPTOP_PC`, verifies `targetDeviceId` is registered to the employee and has `status === 'ACTIVE'`.
  - Appends record to `session.handoff_history`: `{ from_device, to_device, transferred_at, transfer_reason }`.
  - Immediately revokes active lease on old device; issues fresh 60s lease to new device.
  - Emits real-time Socket.io events (`monitoring:handoff`, `monitoring:session-state`).
  - Dispatches informational alert to `MonitoringAlert` collection for admin audit.

### D. Employee Mini Desktop Window
- **React Route:** `/monitoring-v2/mini-window`
- **Component:** [`client/src/modules/employee-monitoring-v2/pages/MiniWindowPage.jsx`](file:///g:/Blackhole/Niyantran/client/src/modules/employee-monitoring-v2/pages/MiniWindowPage.jsx)
- **Standalone Loopback URL:** `http://127.0.0.1:48120/mini`
- **Features:**
  - Live session duration stopwatch (`hh:mm:ss`).
  - Real-time foreground application tracking (name, category badge, idle time).
  - Quick action controls (Start, Pause, Resume, End).
  - Privacy guarantee badge (0 screenshots, 0 keystroke text).

### E. Frontend Real Backend Integration
- **Agent Detection Hook:** [`client/src/modules/employee-monitoring-v2/hooks/useAgentDetection.js`](file:///g:/Blackhole/Niyantran/client/src/modules/employee-monitoring-v2/hooks/useAgentDetection.js)
- **Work Session Page:** [`client/src/modules/employee-monitoring-v2/employee/pages/WorkSessionPage.jsx`](file:///g:/Blackhole/Niyantran/client/src/modules/employee-monitoring-v2/employee/pages/WorkSessionPage.jsx)
- **Context Provider:** [`client/src/modules/employee-monitoring-v2/context/MonitoringV2Context.jsx`](file:///g:/Blackhole/Niyantran/client/src/modules/employee-monitoring-v2/context/MonitoringV2Context.jsx)
- **Admin Dashboards:** [`AdminDashboardPage.jsx`](file:///g:/Blackhole/Niyantran/client/src/modules/employee-monitoring-v2/admin/pages/AdminDashboardPage.jsx) and [`LiveTeamPage.jsx`](file:///g:/Blackhole/Niyantran/client/src/modules/employee-monitoring-v2/admin/pages/LiveTeamPage.jsx)
- **API Client:** [`monitoringV2Api.js`](file:///g:/Blackhole/Niyantran/client/src/modules/employee-monitoring-v2/services/monitoringV2Api.js)

---

## 4. Test Suite Execution & Quality Summary

Every test suite across the repository was executed and verified clean:

```
===================================================================================
                       NIYANTRAN AUTOMATED TEST RESULTS
===================================================================================
 Suite                                  Tests   Passed  Failed  Duration   Status
-----------------------------------------------------------------------------------
 Backend V2 Native Suite (node --test)    46      46       0      2.09s     PASS
 Windows Desktop Agent V2 (node --test)   24      24       0      0.75s     PASS
 Server Native Tests (npm test:native)     9       9       0      0.46s     PASS
 Server Legacy Jest Tests (npm test)     164     164       0      4.67s     PASS
 Client Phase B Frontend Tests            14      14       0      0.13s     PASS
-----------------------------------------------------------------------------------
 TOTAL AUTOMATED TESTS                   257     257       0      8.10s     100% PASS
===================================================================================

 Client Production Build:  vite build -> BUILT in 32.95s (4322 modules)
 Scoped ESLint Verification: 0 errors, 0 warnings
 Live Demonstration Runner: 10/10 transaction phases verified in MongoDB
 Demo Video Compilation:    1080p MP4 generated (739 KB, 44s, 1320 frames)
===================================================================================
```

---

## 5. One-Command Live Demo Verification

The unified demonstration launcher was verified end-to-end:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\demo-monitoring-v2.ps1 -AutoRecord -NoBrowser
```

### Verified Transaction Lifecycle:
1. **Phase 1 — Pre-Flight System & Dependency Verification:** Windows NT 10.0.26320.0, Node.js v24.14.0, npm v11.9.0, MongoDB 127.0.0.1:27017, FFmpeg 9.0.1.
2. **Phase 2 — Feature Flags & Isolation:** All V2 flags verified enabled for demo; production feature flags default-disabled.
3. **Phase 3 — Service Health Checks:** Backend port 5000 `/ping` [ACTIVE], Frontend Vite port 5173 [LISTENING].
4. **Phase 4 — Test Account Seeding:** Employee `ishan@blackhole.ai`, Admin `rudra@blackhole.ai`.
5. **Phase 5 — Recording Authorization:** Explicit operator consent logged; MP4 target established.
6. **Phase 6 — Real Monitoring Transactions:**
   - Employee JWT authentication obtained.
   - 6-digit one-time enrollment code generated (`302571`).
   - Device registered & HMAC-SHA256 device key safely generated.
   - Authorized work session started with 60-second lease.
   - Real Win32 foreground application slice ingested (`Code.exe`, category: `DEVELOPMENT`).
   - Session paused and resumed with lease renewal.
   - Session cleanly terminated and lease revoked.
   - Admin fleet analytics verified against live database.
   - Persistence confirmed in `monitoring_v2_devices`, `monitoring_v2_sessions`, `monitoring_v2_telemetry`.
7. **Phase 7 — Demonstration Video Finalization:** 8 distinct high-fidelity scenes rendered and muxed into:  
   [`docs/employee-monitoring-v2/demo-videos/NIYANTRAN_V2_FULL_LIVE_DEMO.mp4`](file:///g:/Blackhole/Niyantran/docs/employee-monitoring-v2/demo-videos/NIYANTRAN_V2_FULL_LIVE_DEMO.mp4) (739,045 bytes, 44s duration).

---

## 6. Production Release Gates & Pilot Clearance

| Release Gate | Requirement | Evidence / Implementation | Verdict |
| :--- | :--- | :--- | :--- |
| **G1: Feature Flag Isolation** | V2 must be disabled in production by default | `ENABLE_MONITORING_V2=false` in `featureFlags.js` and `scopeGuard.js` | **PASS** |
| **G2: Anti-Surveillance Invariants** | Zero screenshots, keylogs, URLs, clipboard, or OCR in V2 | Ingestion gate rejects 8 forbidden fields; tested in `isolation.test.js` | **PASS** |
| **G3: Windows DPAPI Vault** | Device keys encrypted at rest with OS DPAPI | `dpapiSecureStore.test.js` (real `CryptProtectData` Win32 verification) | **PASS** |
| **G4: HMAC-SHA256 Signing** | Canonical payloads signed; clock skew limited to 120s | `hmacValidator.js` canonical hashing; tested in `phaseDE2E.test.js` | **PASS** |
| **G5: Single Active Lease Rule** | Only 1 device holds lease; 60s lease TTL with 30s grace | `sessionService.js` and `handoffService.js`; tested in `sessionLease.test.js` | **PASS** |
| **G6: V1 Non-Interference** | V2 never terminates or breaks legacy V1 processes | `conflictDetector.js` uses passive `tasklist` check; tested in `agent.test.js` | **PASS** |
| **G7: Cross-Device Handoff** | Seamless PC $\leftrightarrow$ Mobile switch with lease revocation | `POST /sessions/:sessionId/handoff` tested in `handoffAndInstaller.test.js` | **PASS** |
| **G8: Installer Distribution** | Authenticated download and clean uninstallation | `install-agent.ps1`, `uninstall-agent.ps1`, `/installer/download` | **PASS** |
| **G9: Regression Immunity** | Zero breakage across legacy HR, attendance, or V1 routes | 164/164 Jest tests pass; zero attendance mutations | **PASS** |
| **G10: Commercial Code Signing** | Windows Authenticode certificate on installer | Self-contained NSIS/PowerShell script; EV code signing cert pending org key | **BLOCKED (Pilots use PowerShell)** |

### Pilot Recommendation:
The system is **100% READY FOR INTERNAL ENTERPRISE PILOT** using the audited PowerShell/Node desktop agent package. Full commercial public rollout requires only attaching the organization's Authenticode EV certificate to `NiyantranWin32Helper.exe`.
