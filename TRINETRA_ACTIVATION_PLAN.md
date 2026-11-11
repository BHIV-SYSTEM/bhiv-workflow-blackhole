# TRINETRA AI Agent — NIYANTRAN Activation Plan

**Status:** REVIEW ONLY — no main-workflow changes until Rudra confirms  
**Prepared for:** Ishan / Rudra  
**Repo:** `bhiv-workflow-blackhole` (Niyantran) · branch `main`  
**Date:** 2026-11-06  

> **Scope rule (from email):** Do not modify Niyantran’s main workflow (tasks, attendance, salary, submissions) until discussion with Rudra and explicit confirmation. This document is the review + activation plan only.

---

## 1. Executive summary

Niyantran already contains a substantial **employee monitoring (EMS)** stack that overlaps heavily with what a TRINETRA-style AI agent would need: website tracking, violation screenshots, OCR, activity/idle scoring, alerts, admin dashboards, and an Electron desktop agent.

**There is no existing code, doc, or env var named “TRINETRA” in this repository** (verified: 0 matches). Activation is therefore mostly **configuration + wiring of existing features**, plus a **small additive integration layer** once Rudra approves — not a greenfield build.

| Area | Verdict |
|---|---|
| Website tracking | **Implemented** — needs per-employee start + browser collector already on login |
| Screenshot monitoring | **Implemented** — intelligent/violation mode on; **periodic capture deliberately disabled** |
| Activity / keystroke / idle | **Implemented** — browser EMS + Electron agent |
| Admin monitoring UI | **Implemented** — `/monitoring` page, many panels |
| AI analysis (OCR / productivity) | **Implemented** — needs OCR worker (present) + optional AI keys |
| Consent enforcement | **Gap** — flags exist; **ingest paths do not check them** |
| Auth on monitoring APIs | **Gap** — `auth` imported but mostly unused on `/api/monitoring` and signal ingest |
| TRINETRA-specific module | **Missing** — to be added only after approval |
| Electron agent verify endpoint | **Gap** — agent calls `GET /api/agent/verify` (route absent) |

---

## 2. Existing NIYANTRAN capabilities (relevant to TRINETRA)

### 2.1 Website tracking — ALREADY IMPLEMENTED

| Piece | Location | Notes |
|---|---|---|
| Server service | `server/services/websiteMonitor.js` | ~8s polling, suspicious-pattern regexes, whitelist checks, publishes `disallowed_site` |
| Start/stop | `POST /api/monitoring/start/:employeeId` · `stop` · `start-all` · `stop-all` | `server/routes/monitoring.js` (mounted `/api/monitoring`) |
| Browser-side signals | `client/src/services/monitoring-service.js` + `public/ems-signal-collector.js` | Starts with login via `auth-context` → `startMonitoring(user)` |
| Whitelist | `GET/POST/PUT/DELETE /api/monitoring/whitelist` + `WebsiteWhitelist` model | UI: `WhitelistManager.jsx` |
| Signals API | `/api/ems-signals/*` (`routes/emsSignals.js`) | `signals/init`, `signals`, timeline, proof |
| Desktop active window | `employee-agent/src/utils/activeAppWatcher.js` | PowerShell foreground window every ~1.5s |

**Activation:** ensure admin starts monitoring for target employees; browser collector runs on login; env intervals already defaulted in code.

### 2.2 Screenshot monitoring — ALREADY IMPLEMENTED (mode matters)

| Mode | Status | Where |
|---|---|---|
| **Intelligent / violation-only** | **Active default** (`intelligentMode = true`) | `intelligentScreenCapture.js` — max 3 shots/violation, 5-min cooldown, OCR + optional AI |
| **Periodic capture** | **Disabled in service** (`disabled: true`) | `screenCapture.js` — interval path marked disabled |
| Storage | Local `SCREENSHOT_STORAGE_PATH` + optional Cloudinary | `ENABLE_LOCAL_BACKUP`, Cloudinary utils |
| Admin gallery | `GET /api/monitoring/employees/:id/screenshots`, `GET /api/monitoring/screenshots/:id` | Violation shots only in gallery queries |
| Ecosystem push | `eventBus` → `store_screenshot` → `bucketClient.storeScreenshot` | Redis or local fallback |

**Activation decision (Rudra):** stay on **violation-only** (recommended, privacy-light) vs re-enable **periodic** capture (needs product + privacy sign-off).

### 2.3 Activity / idle / productivity — ALREADY IMPLEMENTED

| Source | Path | Persistence |
|---|---|---|
| Browser EMS | `monitoring-service.js` → `POST /api/ems-signals/signals` | `EmployeeActivity` (90-day TTL) |
| Server tracker | `services/activityTracker.js` | idle alerts → `MonitoringAlert`, eventBus `excessive_idle` |
| Electron agent | `employee-agent` → `POST /api/agent/activity/ingest` | Same `EmployeeActivity`; **403 if no open attendance day** |
| Scoring | `models/EmployeeActivity.js` `calculateProductivityScore()` | hard-0 on idle/no input |

### 2.4 AI / analysis — ALREADY IMPLEMENTED (keys optional)

- OCR: `ocrAnalysisService.js` (Tesseract) — worker initialized at boot in current run  
- UniGuru / Groq: `uniguruAIService`, `groqAIService` — degrade if keys missing  
- Admin AI panel: `AIInsightsPanel` → `/monitoring/intelligent/stats`, `/monitoring/ai/test`  
- Reports: PDF/CSV via `reportGenerator.js` + `/monitoring/report/*`, `/monitoring/export/*`

### 2.5 Admin UI — ALREADY IMPLEMENTED

Route: `/monitoring` → `pages/EmployeeMonitoring.jsx`  
Panels: MonitoringDashboard, Daily/Monthly views, ScreenshotGallery, AlertsPanel, WhitelistManager, BulkMonitoringControls, AIInsightsPanel, ReportsGenerator, ProductionDashboard, TeamOverviewGrid, EmployeeDetailModal.

### 2.6 Desktop agent (employee-agent) — ALREADY IMPLEMENTED

- Login, start/end day, 30s telemetry, idle, active app, auto-start, tray  
- **Explicit non-goals (docs):** no screenshots, no keystroke content, no stealth  
- **Broken:** `GET /api/agent/verify` has **no server route** (`routes/agent.js` is empty/unmounted)

### 2.7 Ecosystem extension points (safe, additive)

| System | Client | Use for TRINETRA |
|---|---|---|
| Event bus | `services/eventBus.js` | publish `trinetra.*` events (own subscribers) |
| KARMA | `karmaClient.js` → Bucket | reuse `NIY_MON_*` or add `NIY_TRN_*` reason codes |
| PRANA | `pranaClient.sendTelemetry` | fire-and-forget, circuit breaker |
| Bucket | `bucketClient.writeArtifact/storeScreenshot` | evidence artifacts |
| SETU | `setuDispatcher` | only if tied to execution lifecycle — optional |
| Health | `GET /api/integration/health` | add probe block later |

---

## 3. Implemented vs needs activation vs missing

### Already implemented (use as-is)

- [x] Website monitoring service + whitelist + admin start/stop  
- [x] Violation intelligent screenshots + OCR + alert records  
- [x] Browser signal collector on login (`ems-signals`)  
- [x] Electron activity agent + ingest API (day-active gate)  
- [x] Monitoring dashboards, reports (PDF/CSV), daily/monthly summaries  
- [x] Event bus → KARMA / Bucket side-channels  
- [x] Consent **UI** (`ConsentSettings` → `POST /api/consent`)  
- [x] Retention fields on User (`dataRetentionPeriod`, default 30)  

### Needs activation / configuration (no code change to core workflow)

- [ ] **Per-employee or bulk monitoring start** in target environment (`POST /api/monitoring/start/:id` or `start-all`)  
- [ ] Confirm **browser collector** running for logged-in users (depends on client build + login)  
- [ ] Confirm **Electron agent** deployed with correct `AGENT_API_BASE_URL` (code default fallback `127.0.0.1:5001` vs server `5000` — align env)  
- [ ] Populate **WebsiteWhitelist** (allowed vs blocked domains for TRINETRA policy)  
- [ ] Optional: **GROQ / GEMINI / UNIGURU** keys for AI pre-screening of captures  
- [ ] Optional: **Cloudinary** for screenshot storage (else local path only)  
- [ ] Optional: **Redis** for shared eventBus (else in-process fallback — OK single-node)  
- [ ] Optional: **Bucket / PRANA / SETU** env if ecosystem evidence/telemetry required  
- [ ] Decide screenshot mode: **violation-only (default)** vs periodic (currently disabled)  
- [ ] Align `employee-agent/.env` `AGENT_API_BASE_URL` → `http://localhost:5000` (or deployed host)  
- [ ] Fix or implement `GET /api/agent/verify` **when approved** (currently missing)  

### Missing / gaps (require Rudra approval before code)

| # | Gap | Risk if activated as-is |
|---|---|---|
| G1 | **No TRINETRA module** (0 references in repo) | N/A — integration layer to design |
| G2 | **`User.monitoringPaused` never checked** on ingest/monitoring paths | Users who “opt out” still monitored |
| G3 | **`consentManager.isMonitoringAllowed()` has zero callers** | Consent model not enforced |
| G4 | **`/api/monitoring/*` largely unauthenticated** (auth imported, unused) | Unauthorized start/stop/read of monitoring |
| G5 | **EMS signal ingest mostly unauthenticated** (only `/timeline` uses auth) | Spoofed telemetry |
| G6 | Electron **forces local consent=true** every start | Local consent meaningless |
| G7 | **Retention cron not implemented** | Data grows against GDPR docs |
| G8 | Periodic screenshot **disabled** by design | Must consciously re-enable if required |
| G9 | Agent **`/api/agent/verify` missing** | Agent verify flow fails |

---

## 4. Integration requirements (TRINETRA)

### 4.1 Recommended architecture (additive only)

```
[Browser EMS collector] ──┐
[Electron agent] ─────────┼──► existing /api/ems-signals, /api/agent, /api/monitoring
[Admin start monitoring] ─┘         │
                                    ▼
                         existing services (websiteMonitor,
                         intelligentScreenCapture, activityTracker)
                                    │
                    ┌───────────────┼────────────────┐
                    ▼               ▼                ▼
              MonitoringAlert  EmployeeActivity   ScreenCapture
                    │               │                │
                    └─────── eventBus / clients ─────┘
                                    │
                    KARMA · PRANA · Bucket · (optional SETU)

Future (after approval) — NEW, isolated:
  server/routes/trinetra.js  +  models/TrinetraObservation.js
  mount: app.use('/api/trinetra', ...)   // one line in index.js
  gates: auth + consent + DAY_NOT_ACTIVE
```

**Do not touch:** `routes/tasks*`, `attendance*`, `submission*`, `salary*`, `enhancedAttendance`, core models Task/Attendance/DailyAttendance/Salary/Aim (except read-only queries if ever needed).

### 4.2 Endpoint map (existing — integrity)

| Method | Path | Auth today | Role in TRINETRA |
|---|---|---|---|
| POST | `/api/monitoring/start/:employeeId` | **none** (gap) | Activate website/intelligent monitoring |
| POST | `/api/monitoring/stop/:employeeId` | **none** | Deactivate |
| POST | `/api/monitoring/start-all` \| `stop-all` | **none** | Bulk |
| GET | `/api/monitoring/team-summary` etc. | **none** | Dashboards |
| GET | `/api/monitoring/employees/:id/screenshots` | **none** | Evidence gallery |
| GET/PUT | `/api/monitoring/alerts*` | **none** | Alert workflow |
| CRUD | `/api/monitoring/whitelist` | **none** | Site policy |
| POST | `/api/ems-signals/signals` \| `init` | **none** | Browser telemetry ingest |
| GET | `/api/ems-signals/timeline/:employeeId` | **auth** | Timeline |
| POST | `/api/agent/activity/ingest` | **auth** + day-active | Desktop telemetry |
| GET | `/api/agent/verify` | — | **NOT IMPLEMENTED** |
| POST | `/api/consent` | **auth** | Pause/resume monitoring flag |
| GET | `/api/alerts` | **auth** | User’s alerts |
| GET | `/api/integration/health` | **auth + admin** | Ecosystem health |

Activation plan must either **accept current auth gaps as temporary** or **add auth in a follow-up PR approved by Rudra** (recommended before production TRINETRA rollout).

### 4.3 Env / dependencies

**Already read by code (tunable):**  
`ACTIVITY_TRACKING_INTERVAL`, `IDLE_THRESHOLD`, `WEBSITE_MONITORING_INTERVAL`, `BROWSER_CHECK_INTERVAL`, `ACTIVITY_FLUSH_INTERVAL`, `SCREEN_CAPTURE_INTERVAL`, `COMPRESSION_QUALITY`, `MAX_SCREENSHOT_SIZE`, `SCREENSHOT_STORAGE_PATH`, `ENABLE_LOCAL_BACKUP`, `REDIS_URL`, `BUCKET_*`, `PRANA_*`, `SAMPADA_SETU_*`, Cloudinary, `GROQ_*`/`GEMINI_*`/`UNIGURU_*`.

**Declared in `.env.example` but not actually read (do not rely):**  
`BROWSER_MONITORING_ENABLED`, `BROWSER_CACHE_TIMEOUT`, `BROWSER_RATE_LIMIT`, `SCREENSHOT_QUALITY`, `SCREENSHOT_MAX_SIZE`, `AI_ANALYSIS_ENABLED`, `MAX_AI_RETRIES`, `CLOUDINARY_STORAGE_ENABLED`.

**Hard boot requirements (unchanged):** `JWT_SECRET`, `TANTRA_EXECUTION_KEY`, `MONGODB_URI`.

**External:** MongoDB (required), Redis (optional), Cloudinary (optional), AI keys (optional), SMTP (email only), Bucket/PRANA (optional ecosystem).

---

## 5. Pending items checklist

### A. Review (done in this pass)

- [x] Inventory monitoring / screenshot / website / agent capabilities  
- [x] Confirm zero in-repo TRINETRA references  
- [x] Map endpoints, UI, env, consent, ecosystem hooks  
- [x] Identify activation vs missing vs needs-config  

### B. Awaiting Rudra confirmation (no code until then)

- [ ] Product definition of “TRINETRA AI Agent” vs existing EMS (delta only)  
- [ ] Screenshot policy: violation-only vs periodic  
- [ ] Whether to add auth to `/api/monitoring` + EMS ingest (recommended yes)  
- [ ] Whether to enforce `monitoringPaused` + consent on all ingest (recommended yes)  
- [ ] Whether TRINETRA needs new API surface (`/api/trinetra`) or only activates existing  
- [ ] Whether desktop agent must gain new collectors (respect no-screenshot/no-keylog docs)  
- [ ] Ecosystem: KARMA/PRANA/Bucket/SETU required or not  
- [ ] Retention: implement cron or manual policy  
- [ ] Fix `GET /api/agent/verify` or remove client call  
- [ ] Align `AGENT_API_BASE_URL` and deploy agent version  

### C. Post-approval implementation phases (proposed)

| Phase | Work | Touches main workflow? |
|---|---|---|
| **P0 – Config only** | Start monitoring for cohort; whitelist; env; agent base URL; verify UI at `/monitoring` | **No** |
| **P1 – Hardening (small PR)** | Auth on monitoring + EMS ingest; consent checks (`monitoringPaused`, `isMonitoringAllowed`); optional verify route | **No** — monitoring only |
| **P2 – TRINETRA layer (new files)** | `routes/trinetra.js`, model, optional eventBus publish, integration health probe | **No** — additive mount line only |
| **P3 – Desktop agent** | New manager module only if required; keep privacy invariants | **No** |
| **P4 – Ecosystem** | KARMA reason codes, PRANA telemetry, Bucket artifacts as agreed | **No** |

---

## 6. Activation steps (runbook — after approval)

### Step 1 — Preconditions
1. Server running with valid `.env` (`JWT_SECRET`, `MONGODB_URI`, `TANTRA_EXECUTION_KEY`).  
2. Client built/run with correct `VITE_API_URL`.  
3. Admin login (e.g. `admin@blackhole.local`).  
4. Confirm `GET /api/ping` and `GET /api/departments` OK.  

### Step 2 — Policy setup
1. Settings → Consent: ensure target users have monitoring consent (`POST /api/consent`).  
2. Populate website whitelist (allowed work domains + blocked patterns policy).  
3. Confirm office/geofence env if attendance-linked (`OFFICE_*`).  

### Step 3 — Activate monitoring
1. Open **Employee Monitoring** (`/monitoring`).  
2. Start for individual (`POST /api/monitoring/start/:id`) or bulk (`start-all`).  
3. Confirm status endpoints show active sessions.  
4. Have target user log in (browser EMS auto-start) and/or run Electron agent with open attendance day.  

### Step 4 — Verify data flow
1. `GET /api/monitoring/employees/:id/activity` → rows appear.  
2. `GET /api/ems-signals/timeline/:employeeId` → timeline builds.  
3. Trigger disallowed site (test account) → `MonitoringAlert` + optional violation screenshot.  
4. `GET /api/monitoring/alerts` → alert visible; acknowledge/resolve works.  
5. Optional: `GET /api/integration/health` → Bucket/PRANA status if configured.  

### Step 5 — Reports
1. Daily/monthly summary panels.  
2. PDF/CSV export paths under `/monitoring/report/*`, `/monitoring/export/*`.  

### Step 6 — Hold for Rudra
- Do not merge P1–P4 code until written confirmation.  
- Coordinate findings with Ishan; schedule review with Rudra.  

---

## 7. Risks & dependencies

| Risk / dependency | Mitigation |
|---|---|
| Unauthenticated monitoring APIs | P1 auth before production cohort |
| Consent not enforced on ingest | P1 consent gates |
| Periodic screenshots off by default | Explicit product decision |
| Electron default API port mismatch (`5001` vs `5000`) | Set `AGENT_API_BASE_URL` |
| Missing `/api/agent/verify` | Implement or drop client call in P1 |
| Dead/legacy route confusion | Only use mounted paths in §4.2 |
| Shared DB with other apps (`artha` collections) | Do not delete/alter non-Niyantran collections |
| Privacy / GDPR docs vs actual retention | Implement retention or document exception |
| Main workflow regression | Strict additive boundary (§4.1) |

---

## 8. Findings summary for Ishan → Rudra

1. **~80–90% of TRINETRA-relevant capability already exists** in EMS (website, screenshots, OCR, activity, alerts, dashboards, desktop agent).  
2. **TRINETRA itself is not in the codebase** — activation = configure EMS + optional thin new layer.  
3. **Immediate safe work:** runbook activation (config only) + this plan.  
4. **Must-fix before serious rollout:** auth on monitoring/EMS ingest; consent enforcement; agent verify gap; agent API URL.  
5. **No main workflow changes** have been made in this review pass.  

---

## 9. Reference — key file index

| Concern | Path |
|---|---|
| Monitoring routes | `server/routes/monitoring.js` |
| EMS signals | `server/routes/emsSignals.js` |
| Agent ingest | `server/routes/agentActivity.js` |
| Website monitor | `server/services/websiteMonitor.js` |
| Intelligent screenshots | `server/services/intelligentScreenCapture.js` |
| Periodic capture (disabled) | `server/services/screenCapture.js` |
| Activity tracker | `server/services/activityTracker.js` |
| Consent route | `server/routes/consent.js` |
| Consent service (unused gate) | `server/services/consentManager.js` |
| Route mounts | `server/index.js` (~581–623) |
| Browser collector | `client/src/services/monitoring-service.js` |
| Monitoring UI | `client/src/pages/EmployeeMonitoring.jsx` + `components/monitoring/*` |
| Desktop agent | `employee-agent/` |
| Signal spec / privacy | `server/services/signal_spec.md` |
| Monitoring audit | `docs/EMPLOYEE_MONITORING_AUDIT_REPORT.md` |
| GDPR | `docs/GDPR.md` |
| Ecosystem contracts | `TANTRA Integration And Ecosystem Convergence for Niyantran/INTEGRATION.md` |

---

---

## 10. Implementation status — 2026-11-07

Phase **P2 (additive TRINETRA layer)** was implemented without touching the core workflow
routes (`tasks*`, `attendance*`, `submission*`, `salary*`) or their models. The layer is
decoupled: it reads existing collections and writes only to `trinetra_configs` plus the
already-existing monitoring collections.

### 10.1 New files (5)

| File | Purpose |
|---|---|
| `server/models/TrinetraConfig.js` | Optional singleton policy doc. **No seeding** — `getSettings()` returns in-code defaults when no document exists. |
| `server/services/trinetraEngine.js` | Pure math: app categorisation, focus/intensity aggregation, tri-factor score, timeline, idle clusters, verification rows. |
| `server/routes/trinetra.js` | Additive `/api/trinetra` router + alert rule engine + retention sweep + scheduler. |
| `employee-agent/src/managers/screenshotEngine.js` | Periodic capture via `desktopCapturer`, dHash dedupe, policy refresh, privacy blocklist. |
| `client/src/components/monitoring/TrinetraConsole.jsx` | Manager console (Eye 1/2/3 + alerts + policy). |

### 10.2 Modified files (13)

`server/index.js` (mount + scheduler + 8 MB body limit), `server/models/EmployeeActivity.js`
(`task_id`, `app_category`, `keystroke_cadence`, `interval_seconds`), `server/models/ScreenCapture.js`
(TRINETRA provenance fields), `server/models/MonitoringAlert.js` (rule provenance fields),
`server/routes/agentActivity.js` (new-field ingest, consent/pause gate, `GET /api/agent/verify`),
`employee-agent/src/{main.js,preload.js,services/apiService.js,managers/activityTracker.js}`,
`employee-agent/src/renderer/{index.html,app.js}`, `client/src/lib/api.js`,
`client/src/pages/EmployeeMonitoring.jsx` (TRINETRA tab).

### 10.3 The eight pillars

| # | Capability | Status |
|:--|:---|:---|
| 1 | Automatic screenshot monitoring | **Implemented** — periodic capture from the agent (server-side capture cannot see a remote desktop). Modes `intelligent` / `periodic` / `both`; default stays `intelligent`. |
| 2 | Keyboard & mouse analytics | **Implemented** — counts only, per-interval cadence + intensity index; no keystroke content is ever transmitted. |
| 3 | Website & application tracking | **Implemented** — agent now sends the window title; server categorises into 7 policy categories and computes time allocation. |
| 4 | Idle-time monitoring | **Implemented** — idle interval accounting, merged break clusters, inactivity alerts. |
| 5 | Daily AIM & task tracking | **Implemented** — `GET /api/trinetra/agent/tasks` feeds the agent tray selector; telemetry is stamped with `task_id`. |
| 6 | Completion verification | **Implemented** — matrix joins tracked time + `TaskSubmission` GitHub/document links + Parikshak review score. |
| 7 | Automated alerts | **Implemented** — inactivity, low focus, stalled task, overdue task; dedupe key + cooldown; background sweep. |
| 8 | Centralised manager dashboard | **Implemented** — `/monitoring` → TRINETRA AI tab: live grid, timeline + snapshot gallery, verification matrix, alert workflow, policy editor, CSV export. |

### 10.4 Endpoint surface (all additive)

```
GET    /api/trinetra/config                 effective policy (any authenticated role)
PUT    /api/trinetra/config                 Admin/Manager only
GET    /api/trinetra/agent/config           capture policy for the desktop agent
GET    /api/trinetra/agent/tasks            assigned tasks + today's aims
POST   /api/trinetra/agent/screenshot       periodic capture ingest (consent + day gate)
GET    /api/trinetra/telemetry/live         live grid (manager: team, employee: self)
GET    /api/trinetra/productivity/summary   tri-factor scores, daily|weekly
GET    /api/trinetra/productivity/employee/:id
GET    /api/trinetra/timeline/:id
GET    /api/trinetra/screenshots            list (type=periodic|violation|all)
GET    /api/trinetra/screenshots/:id        RBAC-guarded image stream
GET    /api/trinetra/verification/matrix    deliverables + evidence + review
GET    /api/trinetra/alerts                 unified stream
POST   /api/trinetra/alerts/evaluate        manual rule sweep
PUT    /api/trinetra/alerts/:id/{acknowledge|resolve}
GET    /api/trinetra/status                 coverage, capture counters, scheduler state
GET    /api/trinetra/report/export          CSV (range=daily|weekly)
GET    /api/agent/verify                    <- previously missing; now implemented
```

### 10.5 Gaps closed from §3

- **G2 `monitoringPaused`** — now enforced on agent ingest (was silently ignored).
- **G3 consent** — explicit `Consent` records are enforced on both ingest paths; absence of a
  record keeps the platform default and is reported as `consent_record:false` rather than
  claiming consent exists.
- **G4/G5 auth** — every TRINETRA route is authenticated; manager-only routes return 403
  for employees; screenshot bytes are RBAC-guarded and audited.
- **G7 retention** — scheduled sweep purges **periodic** captures past `retention_days`.
  Violation evidence is deliberately out of scope.
- **G8 periodic capture** — now available without re-enabling the disabled server-side loop.
- **G9 `/api/agent/verify`** — implemented.
- **Agent API port** — fallback corrected from `5001` to `5000`.

### 10.6 Activation checklist (operator)

1. Deploy the updated server + client; restart the API process (the scheduler starts with it).
2. `GET /api/trinetra/status` → confirm `layer: trinetra` and coverage figures.
3. Choose capture mode in **Monitoring → TRINETRA AI → Policy** (`periodic`/`both`) and set
   `interval_minutes`, `max_per_hour`, `retention_days`, `blocked_title_patterns`.
4. Rebuild/ship the desktop agent (`employee-agent`), confirm `AGENT_API_BASE_URL`.
5. Start a workday on a test machine → verify telemetry rows, then a periodic capture, then
   the gallery thumbnail.
6. Run **Alerts → Run rules now** once to confirm the sweep; the background sweep then
   repeats every `evaluation_interval_minutes`.

### 10.7 Deliberate deviations from the earlier draft

- Activity fields use the model's existing `snake_case` (`task_id`, `app_category`,
  `keystroke_cadence`) instead of camelCase, and **no duplicate `productivityScore`** was added
  (the model already has `productivity_score`).
- Periodic capture lives in the **agent**, not `services/screenCapture.js` — the server cannot
  see a remote employee desktop, and re-enabling that loop would double-capture.
- Alert types reuse the existing `MonitoringAlert` enum (`task_reminder`, `idle_timeout`,
  `productivity_drop`) instead of extending the enum, so existing alert consumers keep working.
- OCR text search was **not** added to the gallery; it needs an explicit product decision
  (cost/CPU) and is unrelated to the eight requested pillars.

### 10.8 Verification performed

- `node --check` on all touched server + agent files.
- `npm run build` (client) — production build succeeds.
- **79/79 end-to-end checks** against a real (ephemeral, in-memory) MongoDB mounting the real
  routers: config RBAC + persistence, ingest gates, task attribution, live grid, scoring
  (including `insufficient_data` instead of a fabricated score), screenshot store/dedupe/
  privacy-block/RBAC, verification matrix, alert generation + dedupe/cooldown, retention
  scoping, CSV export, and legacy-payload compatibility. The harness was removed after the run.
- **Not verified here:** Electron GUI (dependencies are not installed on this machine),
  real screen-capture permissions, and a live production MongoDB.

---

---

## 11. Live monitoring pass — 2026-11-07

### 11.1 How a machine that is not in the office is monitored

Nothing reaches *into* the employee machine. There is no inbound port, no remote-control
channel and no screen-scraping from the server. Two clients push outward over HTTPS:

| Client | What it can see | Cadence |
|---|---|---|
| Web app (`monitoring-service.js`) | Keys pressed (count only), mouse moves/clicks/wheel (count only), idle seconds, active page title | 5 s |
| Desktop agent (Electron) | The same counters **plus** OS-level idle time, the real foreground window title, and full-screen capture | 5 s telemetry, random capture |

The server never receives keystroke *content* — only counts — so the system cannot reconstruct
typed text. A browser-only candidate is fully covered for live productivity and alerts; a
full-desktop screenshot requires the agent, because a web page cannot capture the OS desktop.

### 11.2 Changes in this pass

- **5-second live loop.** `TRINETRA_INTERVAL_MS` 30 s → 5 s, agent `SEND_INTERVAL_MS` = 5 s, and the
  console's live grid poll 10 s → 5 s. Every stored counter is normalised to a per-minute rate on
  ingest, so a shorter window changes freshness only — the scores keep their scale.
- **"Still for 5 minutes" alert.** New `alerts.still_minutes` (default 5) and rule `still`. The old
  inactivity rule watched for telemetry that *stops arriving*, which a heartbeat never does; the
  new rule reads the freshest sample's `idle_duration`, and falls back to the sample's age so a
  sleeping laptop still alerts. One alert per 30-minute block while the employee stays still.
- **Prompt evaluation.** `alerts.evaluation_interval_seconds` (default 30) replaces the 15-minute
  sweep, which could not detect a 5-minute threshold. `evaluation_interval_minutes` is retained as
  a deprecated alias so stored documents and older clients still validate.
- **Random capture on by default.** `screenshot.mode` default → `both`, `interval_minutes` 15 → 10
  with 0–5 min jitter. The stored policy was switched to `both` (15 min + jitter) so periodic
  capture is active on the existing deployment.

### 11.3 Verification (real, not simulated)

A temporary harness booted the **real server process** against a scratch database on the live
cluster and drove it over HTTP. **44/44 checks passed**, including: login, config defaults with no
seeded document, 5 s ingest, per-minute normalisation (25 keys / 5 s → 300/min), live grid freshness
under 15 s, idle status flip, an alert raised **autonomously by the 30 s scheduler** without a
manual trigger, dedupe on repeat sweeps, screenshot store → dHash dedupe → privacy block → RBAC
byte streaming, and cross-employee read denial. The scratch database and test files were removed.

Not covered: the Electron GUI (dependencies are not installed on this machine), so agent-side
capture and 5 s agent transmission were not executed end to end, and the console was not viewed
in a browser.

---

*End of activation plan.*
