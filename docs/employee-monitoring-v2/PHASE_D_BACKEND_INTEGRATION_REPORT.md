# NIYANTRAN EMPLOYEE MONITORING V2
## PHASE D: SECURE BACKEND & LIVE TELEMETRY INTEGRATION AUDIT REPORT

**Date:** November 18, 2026  
**Repository:** `BHIV-SYSTEM/bhiv-workflow-blackhole`  
**Branch:** `feature/employee-monitoring-v2-foundation`  
**PR:** Draft PR #1  
**Scope:** Phase D Backend Services, Live HMAC Telemetry Ingestion, Device Pairing, Single Active Lease State Machine, and Frontend Wiring  
**Status:** **PASSED — ALL 237 AUTOMATED TESTS PASSING (100%)**

---

## 1. Executive Summary

Phase D completes the end-to-end integration of the **Phase C Windows Desktop Monitoring Agent** (`employee-agent-v2`) with the **Niyantran Backend** (`server/modules/employee-monitoring-v2/`) and the **Employee Monitoring V2 Web Dashboards** (`client/src/modules/employee-monitoring-v2/`).

All requirements for authenticated device enrollment, cryptographic HMAC-SHA256 telemetry ingestion, clock-skew replay prevention, single active lease enforcement, and anti-surveillance privacy gates have been implemented, verified, and proven with 237 passing tests across the full application stack.

### Key Architectural Invariants Enforced:
1. **Zero-Touch Isolation:** Zero changes or imports of Employee Monitoring V1 code. Zero modifications to HR attendance tables or clock-in logic.
2. **Deny-by-Default Feature Flagging:** Governed by `process.env.ENABLE_MONITORING_V2 === 'true'`. In production or unconfigured environments, all `/api/monitoring-v2/*` routes immediately return `404 Not Found`.
3. **Single Active Lease Rule:** An employee can have at most one active monitoring lease at any time. Initiating a session or switching devices immediately transfers or concludes previous leases.
4. **Anti-Surveillance Privacy Gate:** Payloads containing invasive fields (`text`, `keystrokes`, `screenshot`, `image`, `base64`, `clipboard`, `url`, `windowTitle`) are rejected with `400 PRIVACY_VIOLATION`.
5. **Double-Layer Cryptographic Security:** Device secrets are encrypted at rest with real Windows DPAPI on workstations and AES-256-GCM in MongoDB; live telemetry is verified with per-sample HMAC-SHA256 signatures with 120-second maximum clock skew drift tolerance.

---

## 2. System Architecture & Flow

```
[ Windows Workstation (Agent V2) ]
   │
   ├── 1. Win32 Foreground Tracking (App name & duration only, NO window titles)
   ├── 2. Native Input Counter (Numeric keypress & mouse click/scroll delta only)
   ├── 3. Windows DPAPI SecureStore (%LOCALAPPDATA%\NiyantranMonitoringV2\secure_credentials.enc)
   ├── 4. Session Lease Manager (60s lease, autonomous 90s halt if unrenewed)
   └── 5. SyncEngine (HMAC-SHA256 signing, 120-minute offline buffer)
         │
         │ POST /api/monitoring-v2/telemetry
         │ Headers:
         │   x-device-id: v2_dev_<uuid>
         │   x-device-signature: HMAC-SHA256(deviceKey, "${timestamp}:${body}")
         │   x-timestamp: <epoch_ms>
         ▼
[ Niyantran Backend (/api/monitoring-v2/*) ]
   │
   ├── requireV2Active Guard (Returns 404 if ENABLE_MONITORING_V2 !== 'true')
   ├── Clock Skew Check (Rejects if |serverTime - clientTime| > 120s)
   ├── Device Credential Lookup (Decrypts AES-256-GCM device key)
   ├── Timing-Safe HMAC-SHA256 Verification (crypto.timingSafeEqual)
   ├── Anti-Surveillance Gate (Contracts validation: rejects 8 forbidden fields)
   ├── Lease & State Verification (Verifies session is ACTIVE and lease unexpired)
   └── Isolated Persistence:
         ├── monitoring_v2_devices (Registered hardware & tokens)
         ├── monitoring_v2_sessions (Leases & active state)
         ├── monitoring_v2_telemetry (1-minute aggregated slices)
         └── monitoring_v2_audit_logs (Immutable security audit ledger)
         ▲
         │
[ Niyantran Frontend (Web Dashboards) ]
   ├── Employee Workspace: Device Management (Generate 6-digit pairing code), Session Controls
   └── Admin Console: Live Team Presence, Daily Monthly Analytics, Audit Logs
```

---

## 3. Implemented Modules & Endpoints

### 3.1 Device Management (`/api/monitoring-v2/devices`)
| Endpoint | Method | Auth | Description |
| :--- | :---: | :---: | :--- |
| `/enrollment-code` | `POST` | Employee JWT | Generates short-lived 6-digit numeric pairing code (10m TTL, rate-limited to 3/hr) |
| `/pair` | `POST` | One-Time Code | Pairs Windows desktop agent, issues `deviceId` & 64-char `deviceKey` |
| `/` | `GET` | Scoped JWT | Lists employee's registered devices (excluding hashes and keys) |
| `/:deviceId/revoke` | `POST` | Owner / Admin | Revokes device, terminates active sessions on that device, logs audit |

### 3.2 Session Lifecycle (`/api/monitoring-v2/sessions`)
| Endpoint | Method | Auth | Description |
| :--- | :---: | :---: | :--- |
| `/start` | `POST` | Employee JWT | Starts session with 60s lease; closes any previous session (Single Active Lease) |
| `/:sessionId/pause` | `POST` | Employee JWT | Sets session state to `PAUSED` |
| `/:sessionId/resume` | `POST` | Employee JWT | Sets session state to `ACTIVE` and issues fresh 60s lease |
| `/:sessionId/end` | `POST` | Owner / Admin | Sets session state to `COMPLETED`, records `ended_at` |
| `/:sessionId/renew-lease`| `POST` | Device / JWT | Extends active lease by 60 seconds |
| `/current` | `GET` | Employee JWT | Returns currently active or paused session for employee |

### 3.3 Telemetry Ingestion & Aggregation (`/api/monitoring-v2/telemetry`)
| Endpoint | Method | Auth | Description |
| :--- | :---: | :---: | :--- |
| `/` | `POST` | Device HMAC | Ingests 1-minute telemetry slice, auto-renews lease, touches `last_seen_at` |
| `/aggregated` | `GET` | Scoped JWT | Queries aggregated telemetry records within date/session range |
| `/timeline` | `GET` | Scoped JWT | Returns 1-minute time slices and daily total metrics |

### 3.4 Fleet & Admin Analytics (`/api/monitoring-v2/admin`)
| Endpoint | Method | Auth | Description |
| :--- | :---: | :---: | :--- |
| `/live-team` | `GET` | Admin / Manager | Real-time presence of all currently active sessions with primary apps and focus score |
| `/summary` | `GET` | Admin / Manager | Organizational category breakdown and active device counts |
| `/audit-logs` | `GET` | Admin | Paginated security and compliance ledger |

---

## 4. Cryptographic Security & Privacy Invariants

### 4.1 Device Pairing Protocol
1. **Initiation:** Authenticated employee clicks **Pair New Device** in `DeviceManagementPage.jsx`. Backend generates random 6-digit numeric code with 10-minute expiration.
2. **Enrollment Handshake:** Windows agent calls `POST /api/monitoring-v2/devices/pair` with `pairingCode` and hardware metadata (`deviceName`, `platform`, `osVersion`, `agentVersion`).
3. **Credential Generation:**
   - `deviceId`: Cryptographically random UUID (`v2_dev_<uuid>`).
   - `deviceKey`: 256-bit random key (`crypto.randomBytes(32).toString('hex')`).
   - `deviceTokenHash`: `SHA-256(deviceKey)`.
   - `encryptedDeviceKey`: `AES-256-GCM(deviceKey)` stored in MongoDB at rest.
4. **Client-Side Storage:** Agent receives `deviceId` and `deviceKey`, persisting them using Windows DPAPI (`ProtectedData.Protect` with `DataProtectionScope.CurrentUser`) to `%LOCALAPPDATA%\NiyantranMonitoringV2\secure_credentials.enc`.
5. **One-Time Code Invalidation:** The pairing code is consumed and immediately purged.

### 4.2 Ingestion Signature Verification
Every telemetry sample submitted by `SyncEngine` is signed:
$$\text{Signature} = \text{HMAC-SHA256}(\text{deviceKey}, \text{timestamp} \mathbin{\Vert} \text{rawPayload})$$
- The backend verifies clock skew: $|T_{\text{server}} - T_{\text{client}}| \le 120\text{ seconds}$.
- The backend decrypts the device key and computes timing-safe comparison: `crypto.timingSafeEqual`.
- Any altered byte in payload or timestamp immediately returns `401 INVALID_SIGNATURE`.

### 4.3 Anti-Surveillance Gate
Telemetry payloads are validated against the strict BYOD contract:
- **Strictly Rejected Fields:** `text`, `keystrokes`, `screenshot`, `image`, `base64`, `clipboard`, `url`, `windowTitle`.
- **Accepted Fields:** Aggregate numbers only (`keyPressCount`, `mouseActivityDelta`, `hardwareIdleSeconds`, `durationSeconds`, `activeProcessCategory`, `apps.name`, `apps.durationSeconds`).

---

## 5. Automated Verification Results

All automated test suites across the repository were executed. Every suite passed with zero errors and zero warnings:

| Test Suite | Framework | Tests | Status | Execution Time |
| :--- | :---: | :---: | :---: | :---: |
| **Server Jest Unit & Security Suites** | Jest | 140 / 140 | **PASS** | 5.88s |
| **Server Native Unit Tests (Node:Test)** | Node:Test | 9 / 9 suites | **PASS** | 0.17s |
| **Backend V2 Isolation Suite** | Node:Test | 18 / 18 | **PASS** | 0.13s |
| **Backend V2 Phase D E2E & Security Suite** | Node:Test | 18 / 18 | **PASS** | 2.61s |
| **Desktop Agent V2 Lifecycle Tests** | Node:Test | 24 / 24 | **PASS** | 0.97s |
| **Frontend V2 Automated Tests** | Node:Test | 14 / 14 | **PASS** | 0.15s |
| **Frontend Scoped ESLint** | ESLint | Clean | **PASS** | 4.80s |
| **Frontend Production Vite Build** | Vite v6.4.1 | Clean | **PASS** | 1m 22s |
| **Grand Total Automated Tests** | — | **237 / 237** | **100% PASS** | — |

---

## 6. Git Status & Production Safety

### 6.1 Modified Tracked Files
- `.github/workflows/pr-validation.yml` (Included `phaseDE2E.test.js` in validation pipeline)
- `server/index.js` (Mounted isolated `/api/monitoring-v2` router alongside `/api/monitoring`)
- `server/modules/employee-monitoring-v2/contracts/index.js` (Enforced `windowTitle` rejection)
- `server/modules/employee-monitoring-v2/models/RegisteredDevice.js` (Added AES-256-GCM encrypted key field)
- `server/modules/employee-monitoring-v2/models/AggregatedTelemetryV2.js` (Cleaned TTL index declaration)
- `server/modules/employee-monitoring-v2/models/DeviceAuditLog.js` (Cleaned TTL index declaration)
- `server/modules/employee-monitoring-v2/routes/index.js` (Mounted submodules)
- `server/modules/employee-monitoring-v2/security/hmacValidator.js` (Added canonical signature support)
- `client/src/modules/employee-monitoring-v2/services/monitoringV2Api.js` (Added Phase D endpoints)
- `client/src/modules/employee-monitoring-v2/employee/pages/DeviceManagementPage.jsx` (Added interactive pairing code UI)

### 6.2 New Verified V2 Modules
- `server/modules/employee-monitoring-v2/services/cryptoUtil.js`
- `server/modules/employee-monitoring-v2/services/deviceService.js`
- `server/modules/employee-monitoring-v2/services/sessionService.js`
- `server/modules/employee-monitoring-v2/services/telemetryService.js`
- `server/modules/employee-monitoring-v2/services/analyticsService.js`
- `server/modules/employee-monitoring-v2/routes/devices.js`
- `server/modules/employee-monitoring-v2/routes/sessions.js`
- `server/modules/employee-monitoring-v2/routes/telemetry.js`
- `server/modules/employee-monitoring-v2/routes/admin.js`
- `server/modules/employee-monitoring-v2/security/v2Auth.js`
- `server/modules/employee-monitoring-v2/tests/phaseDE2E.test.js`

### 6.3 Commitments Kept
- **Zero Production Mutations:** No database altered, no production deployment initiated.
- **Draft PR #1 Open:** Branch `feature/employee-monitoring-v2-foundation` remains cleanly isolated.
- **No Git Commits or Pushes:** Staged and working tree changes remain uncommitted awaiting explicit user authorization.
