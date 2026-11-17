# Employee Monitoring V2: API Specifications & Database Contracts

**Document ID:** `V2-DOC-10`  
**Classification:** Technical Contract & Schema Specification  
**Target Subsystem:** `server/modules/employee-monitoring-v2/`  
**Date:** November 2026  
**Status:** UPDATED FOR PHASE A CORRECTIONS  

---

## 1. Persistence Tier: MongoDB V2 Schemas & Indexes

All V2 collections are strictly decoupled from legacy tables to guarantee backwards compatibility and prevent performance degradation. V2 collections are defined in schema files during Phase A, but are **not connected or instantiated in production MongoDB** during this phase.

### Collection 1: `monitoring_v2_devices`
Stores cryptographic identity, hardware metadata, and approval state for employee machines.

```javascript
const mongoose = require('mongoose');

const registeredDeviceSchema = new mongoose.Schema({
  device_id: {
    type: String,
    required: true,
    unique: true,
    index: true // UUIDv4 generated during device pairing
  },
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  device_name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100 // e.g., "Rohan's MacBook Pro M2"
  },
  platform: {
    type: String,
    enum: ['windows', 'macos', 'linux', 'ios_pwa', 'android_pwa'],
    required: true
  },
  os_version: {
    type: String,
    default: 'Unknown'
  },
  agent_version: {
    type: String,
    default: '2.0.0'
  },
  device_token_hash: {
    type: String,
    required: true // Argon2id or scrypt hash of the issued device secret
  },
  status: {
    type: String,
    enum: ['PENDING_APPROVAL', 'ACTIVE', 'REVOKED', 'BLOCKED'],
    default: 'ACTIVE',
    index: true
  },
  is_byod: {
    type: Boolean,
    default: true
  },
  last_seen_at: {
    type: Date,
    default: Date.now
  },
  last_ip: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  collection: 'monitoring_v2_devices'
});

registeredDeviceSchema.index({ employee: 1, status: 1 });
registeredDeviceSchema.index({ last_seen_at: 1 });
```

---

### Collection 2: `monitoring_v2_sessions`
Authoritative master record of a monitoring work session, lease state, active device ownership, and handoff history. **Zero attendance side effects: this session record does not clock employees in/out or modify HR attendance.**

```javascript
const monitoringSessionV2Schema = new mongoose.Schema({
  session_id: {
    type: String,
    required: true,
    unique: true,
    index: true // e.g., "v2_sess_64fa12..._1700000000"
  },
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  date: {
    type: String,
    required: true, // "YYYY-MM-DD" local timezone key
    index: true
  },
  mode: {
    type: String,
    enum: ['PHONE', 'LAPTOP_PC'],
    required: true,
    default: 'LAPTOP_PC'
  },
  active_device: {
    type: String,
    ref: 'monitoring_v2_devices',
    required: function() { return this.mode === 'LAPTOP_PC'; }
  },
  state: {
    type: String,
    enum: ['INITIALIZING', 'ACTIVE', 'FOCUSED_WORK', 'IDLE', 'AWAY', 'PAUSED', 'DISCONNECTED', 'COMPLETED', 'REVOKED'],
    default: 'ACTIVE',
    index: true
  },
  lease_expires_at: {
    type: Date,
    required: true
  },
  active_task_id: {
    type: String,
    default: null,
    index: true
  },
  accumulated_seconds: {
    active: { type: Number, default: 0 },
    focused_work: { type: Number, default: 0 },
    idle: { type: Number, default: 0 },
    paused: { type: Number, default: 0 }
  },
  handoff_history: [{
    from_device: String,
    to_device: String,
    transferred_at: { type: Date, default: Date.now },
    transfer_reason: String
  }],
  started_at: {
    type: Date,
    default: Date.now
  },
  ended_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  collection: 'monitoring_v2_sessions'
});

monitoringSessionV2Schema.index({ employee: 1, date: 1 });
monitoringSessionV2Schema.index({ state: 1, lease_expires_at: 1 });
// Auto-expire session documents after 180 days
monitoringSessionV2Schema.index({ started_at: 1 }, { expireAfterSeconds: 15552000 });
```

---

### Collection 3: `monitoring_v2_telemetry`
One-minute rolled-up telemetry slices. **Zero raw keystrokes, zero screenshots, zero private window titles.**

```javascript
const aggregatedTelemetryV2Schema = new mongoose.Schema({
  session_id: {
    type: String,
    required: true,
    index: true
  },
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  device_id: {
    type: String,
    required: true,
    index: true
  },
  minute_timestamp: {
    type: Date,
    required: true,
    index: true // Rounded to the nearest minute start (00 seconds)
  },
  duration_seconds: {
    type: Number,
    default: 60,
    min: 1,
    max: 60
  },
  activity_counts: {
    key_presses: { type: Number, default: 0, min: 0 },
    mouse_events: { type: Number, default: 0, min: 0 },
    scroll_events: { type: Number, default: 0, min: 0 },
    hardware_idle_seconds: { type: Number, default: 0, min: 0, max: 60 }
  },
  primary_category: {
    type: String,
    enum: ['DEVELOPMENT', 'DOCUMENTATION', 'COMMUNICATION', 'SUPPORT', 'NEUTRAL', 'EXCLUDED_PERSONAL'],
    default: 'NEUTRAL',
    index: true
  },
  task_id: {
    type: String,
    default: null
  },
  focus_score: {
    type: Number,
    min: 0,
    max: 100,
    default: 50
  },
  sync_type: {
    type: String,
    enum: ['REALTIME', 'OFFLINE_BUFFERED'],
    default: 'REALTIME'
  }
}, {
  timestamps: true,
  collection: 'monitoring_v2_telemetry'
});

aggregatedTelemetryV2Schema.index({ employee: 1, minute_timestamp: -1 });
aggregatedTelemetryV2Schema.index({ session_id: 1, minute_timestamp: 1 });
// 90-day retention index
aggregatedTelemetryV2Schema.index({ minute_timestamp: 1 }, { expireAfterSeconds: 7776000 });
```

---

### Collection 4: `monitoring_v2_audit_logs`
Tamper-proof compliance and security ledger.

```javascript
const deviceAuditLogSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  device_id: {
    type: String,
    default: null
  },
  event_type: {
    type: String,
    enum: [
      'DEVICE_REGISTERED',
      'DEVICE_REVOKED',
      'SESSION_STARTED',
      'SESSION_PAUSED',
      'SESSION_RESUMED',
      'SESSION_SWITCHED',
      'SESSION_ENDED',
      'COLLISION_REJECTED',
      'CLOCK_SKEW_REJECTED',
      'OFFLINE_SYNC_ACCEPTED'
    ],
    required: true,
    index: true
  },
  ip_address: String,
  user_agent: String,
  metadata: mongoose.Schema.Types.Mixed,
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: false,
  collection: 'monitoring_v2_audit_logs'
});

deviceAuditLogSchema.index({ employee: 1, timestamp: -1 });
// 365-day statutory compliance retention
deviceAuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 31536000 });
```

---

## 2. Complete REST API Specifications (`/api/monitoring-v2/*`)

### A. Device Management Endpoints (`/api/monitoring-v2/devices`)

#### 1. Device Registration Handshake
- **Endpoint:** `POST /api/monitoring-v2/devices/register`
- **Auth:** Bearer Token (Employee Web Session)
- **Request Body:**
  ```json
  {
    "deviceName": "Rohan's ThinkPad",
    "platform": "windows",
    "osVersion": "Windows 11 Build 22631",
    "agentVersion": "2.0.0",
    "isByod": true
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "deviceId": "dev_948a21f8-9a67-4bb2-b6f1-285e683b5190",
    "deviceSecret": "sec_d83e7421...391a",
    "pairingPin": "849-204",
    "status": "ACTIVE"
  }
  ```

---

### B. Session Lifecycle Endpoints (`/api/monitoring-v2/sessions`)

#### 1. Start Work Session
- **Endpoint:** `POST /api/monitoring-v2/sessions/start`
- **Auth:** Header `X-Device-Id` + `X-Device-Signature` (HMAC-SHA256)
- **Request Body:**
  ```json
  {
    "mode": "LAPTOP_PC",
    "activeTaskId": "654c8a12..."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "sessionId": "v2_sess_64fa12_1700000000",
    "state": "ACTIVE",
    "leaseExpiresAt": "2026-11-17T06:46:00.000Z",
    "leaseDurationSeconds": 60,
    "policy": {
      "telemetryIntervalSeconds": 10,
      "maxPauseDurationMinutes": 60,
      "privacyMode": "BYOD_STRICT"
    }
  }
  ```

#### 2. Session Heartbeat & Lease Renewal
- **Endpoint:** `POST /api/monitoring-v2/sessions/heartbeat`
- **Auth:** Header `X-Device-Id` + `X-Device-Signature`
- **Request Body:**
  ```json
  {
    "sessionId": "v2_sess_64fa12_1700000000",
    "sequenceNumber": 142,
    "hardwareIdleSeconds": 0,
    "currentCategory": "DEVELOPMENT"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "leaseExpiresAt": "2026-11-17T06:47:00.000Z",
    "serverCommand": "CONTINUE"
  }
  ```

---

### C. Ingestion Endpoints (`/api/monitoring-v2/ingest`)

#### 1. Batch Real-Time Telemetry Ingest
- **Endpoint:** `POST /api/monitoring-v2/ingest`
- **Rate Limit:** 12 requests / minute per device
- **Headers:**
  - `X-Device-Id`: `dev_948a21f8-...`
  - `X-Device-Signature`: `sha256=<HMAC>`
  - `X-Client-Timestamp`: `1700000000`
- **Request Body:**
  ```json
  {
    "sessionId": "v2_sess_64fa12_1700000000",
    "sequenceNumber": 143,
    "samples": [
      {
        "timestamp": "2026-11-17T06:46:10.000Z",
        "durationSeconds": 10,
        "keyPressCount": 42,
        "mouseActivityDelta": 28,
        "scrollDelta": 5,
        "hardwareIdleSeconds": 0,
        "activeProcessCategory": "DEVELOPMENT",
        "taskId": "654c8a12..."
      }
    ]
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "acceptedSamples": 1,
    "lastProcessedSeq": 143,
    "leaseExpiresAt": "2026-11-17T06:47:10.000Z"
  }
  ```
