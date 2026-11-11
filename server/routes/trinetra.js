/**
 * TRINETRA AI — additive intelligence layer.
 *
 * Mounted at /api/trinetra. This router never imports or mutates the core workflow
 * routes (tasks, attendance, salary, submission). It only reads those collections
 * and writes to its own config collection plus the existing monitoring collections
 * (employee_activities, screen_captures, monitoring_alerts).
 *
 * Access model:
 *   - Admin / Manager : team-wide read, config write, alert workflow, exports.
 *   - Employee        : self-scoped read + own desktop-agent ingest only.
 *
 * Privacy / consent model:
 *   - A paused employee (User.monitoringPaused) is never ingested and never scored.
 *   - If an explicit Consent record exists and is disabled/expired, ingest is refused
 *     and the employee is excluded. When no consent record exists we preserve the
 *     platform's current default (monitoring allowed) but report `consent_record:false`
 *     so the gap stays visible instead of silently pretending consent exists.
 */

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const sharp = require('sharp');
const mongoose = require('mongoose');

const auth = require('../middleware/auth');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const EmployeeActivity = require('../models/EmployeeActivity');
const ScreenCapture = require('../models/ScreenCapture');
const MonitoringAlert = require('../models/MonitoringAlert');
const Consent = require('../models/Consent');
const Task = require('../models/Task');
const TaskSubmission = require('../models/TaskSubmission');
const Aim = require('../models/Aim');
const AuditLog = require('../models/AuditLog');
const TrinetraConfig = require('../models/TrinetraConfig');
const engine = require('../services/trinetraEngine');
// Loaded as a model, not just a side-effect import: department names are joined
// by hand below (see attachDepartments).
const Department = require('../models/Department');
const { formatEmployeeId } = require('../utils/employeeId');

const router = express.Router();

const MANAGER_ROLES = ['Admin', 'Manager'];
const SCREENSHOT_BASE_PATH = process.env.SCREENSHOT_STORAGE_PATH || './uploads/employee_data';
const MAX_IMAGE_BYTES = parseInt(process.env.MAX_SCREENSHOT_SIZE, 10) || 5 * 1024 * 1024;

let schedulerHandle = null;
let schedulerState = {
  running: false,
  last_run_at: null,
  last_result: null,
  interval_seconds: null,
  last_error: null,
  last_retention_at: null,
  last_retention_deleted: null
};

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

function isManager(req) {
  return !!req.user && MANAGER_ROLES.includes(req.user.role);
}

function requireManager(req, res, next) {
  if (!isManager(req)) {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Admin or Manager only.'
    });
  }
  return next();
}

// Management actions (policy changes, alert evaluation/triage, report export)
// are Admin-only. Managers keep read-only access to dashboards and live views.
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Admin only.'
    });
  }
  return next();
}

function isValidObjectId(value) {
  return !!value && mongoose.Types.ObjectId.isValid(String(value));
}

/**
 * Resolve department names without `populate('department', 'name')`.
 *
 * Mongoose batches populate into one `Department.find({ _id: { $in: [...] } })`, so a
 * single employee whose `department` holds "" (or any other non-ObjectId value) makes
 * the whole query throw a CastError and turns the endpoint into a 500. Joining by hand
 * keeps every usable reference and reports unusable ones as `department: null`, which
 * is the shape every caller already handles.
 */
async function attachDepartments(users) {
  if (!Array.isArray(users) || users.length === 0) return users;
  const ids = [
    ...new Set(
      users
        .map((user) => (user.department && isValidObjectId(user.department) ? String(user.department) : null))
        .filter(Boolean)
    )
  ];
  if (ids.length === 0) {
    return users.map((user) => Object.assign(user, { department: null }));
  }
  const departments = await Department.find({ _id: { $in: ids } })
    .select('name')
    .lean();
  const byId = new Map(departments.map((department) => [String(department._id), department]));
  return users.map((user) =>
    Object.assign(user, {
      department:
        (user.department && isValidObjectId(user.department) && byId.get(String(user.department))) || null
    })
  );
}

function sameUser(req, employeeId) {
  return !!req.user && String(req.user.id) === String(employeeId);
}

function parseDateParam(value, fallback = new Date()) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

/**
 * Resolve which employee a read/write applies to, enforcing self-scope for
 * non-managers. Returns `{ employeeId }` or `{ error, status }`.
 */
function resolveScope(req, requestedId) {
  if (isManager(req)) {
    // Managers may omit the id to read the whole team (live grid, alert stream).
    if (!requestedId) return { employeeId: null };
    if (!isValidObjectId(requestedId)) return { error: 'Invalid employeeId', status: 400 };
    return { employeeId: String(requestedId) };
  }

  if (requestedId && !sameUser(req, requestedId)) {
    return { error: 'Not authorized to view another employee', status: 403 };
  }
  if (!isValidObjectId(req.user.id)) {
    return { error: 'Invalid session identity', status: 401 };
  }
  return { employeeId: String(req.user.id) };
}

/**
 * Consent + pause gate. Never throws; callers decide whether to refuse.
 */
async function getMonitoringGate(employeeId) {
  const user = await User.findById(employeeId)
    .select('name email role department stillExist monitoringPaused')
    .lean();

  if (!user) {
    return { found: false, allowed: false, reason: 'employee_not_found' };
  }

  if (user.monitoringPaused === true) {
    return { found: true, user, allowed: false, reason: 'monitoring_paused', consent_record: null };
  }

  const consent = await Consent.findOne({ employeeId: String(employeeId), isActive: true }).lean();
  if (!consent) {
    // No explicit consent row: keep the platform's existing default so activation is
    // not blocked for the whole team, but surface the gap.
    return { found: true, user, allowed: true, reason: null, consent_record: false };
  }

  const expired = consent.expirationDate ? new Date(consent.expirationDate) < new Date() : false;
  const allowed = consent.monitoringEnabled === true && !expired;
  return {
    found: true,
    user,
    allowed,
    reason: allowed ? null : expired ? 'consent_expired' : 'consent_disabled',
    consent_record: true,
    consent: {
      monitoring_enabled: consent.monitoringEnabled === true,
      expired,
      expiration_date: consent.expirationDate || null
    }
  };
}

async function findOpenAttendance(userId) {
  const { start, end } = engine.getDayBounds(new Date());
  return Attendance.findOne({
    user: userId,
    date: { $gte: start, $lte: end },
    startDayTime: { $exists: true },
    endDayTime: { $exists: false }
  }).lean();
}

async function writeAudit(userId, action, resource, resourceId) {
  try {
    if (!isValidObjectId(userId)) return;
    await AuditLog.create({
      user: userId,
      action,
      resource,
      resourceId: isValidObjectId(resourceId) ? resourceId : undefined
    });
  } catch (error) {
    // Auditing must never break the request path.
    console.warn('[trinetra] audit write skipped:', error.message);
  }
}

/** 64-bit difference hash (dHash) as 16 hex chars. Independent of agent-supplied values. */
async function computeDHash(buffer) {
  const { data } = await sharp(buffer)
    .resize(9, 8, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = '';
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const left = data[row * 9 + col];
      const right = data[row * 9 + col + 1];
      bits += left > right ? '1' : '0';
    }
  }

  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

function hammingDistance(hashA, hashB) {
  if (!hashA || !hashB || hashA.length !== hashB.length) return 64;
  let distance = 0;
  for (let i = 0; i < hashA.length; i += 1) {
    const a = parseInt(hashA[i], 16);
    const b = parseInt(hashB[i], 16);
    let xor = a ^ b;
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

function splitLinkString(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return String(value)
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSubmission(submission) {
  if (!submission) return null;
  return {
    ...submission,
    additionalLinks: splitLinkString(submission.additionalLinks)
  };
}

/**
 * Load activity documents for a set of employees inside a window, with only the
 * fields the engine needs. Keeps payloads and memory predictable.
 */
async function loadActivities(employeeIds, start, end) {
  return EmployeeActivity.find({
    employee: { $in: employeeIds },
    timestamp: { $gte: start, $lte: end }
  })
    .select(
      'employee timestamp keystroke_count mouse_activity_score idle_duration productivity_score ' +
        'active_application app_category task_id interval_seconds'
    )
    .sort({ timestamp: 1 })
    .lean();
}

/**
 * Tasks that had any movement inside the window: due in-window, created in-window,
 * or updated in-window. Closed tasks remain visible so completion can be verified.
 */
async function loadTasksForWindow(employeeIds, start, end) {
  return Task.find({
    assignee: { $in: employeeIds },
    $or: [
      { dueDate: { $gte: start, $lte: end } },
      { createdAt: { $gte: start, $lte: end } },
      { updatedAt: { $gte: start, $lte: end } },
      { status: { $in: engine.TASK_CLOSED_STATUSES } }
    ]
  })
    .select('title status priority dueDate task_id assignee links updatedAt createdAt closedAt')
    .lean();
}

async function loadSubmissionsByTask(taskIds) {
  if (!taskIds.length) return new Map();
  const submissions = await TaskSubmission.find({ task: { $in: taskIds } })
    .sort({ createdAt: -1 })
    .select(
      'task user githubLink documentLink additionalLinks notes status ' +
        'aiReviewDetails parikshakReview createdAt resubmittedAt'
    )
    .lean();

  const byTask = new Map();
  for (const submission of submissions) {
    const key = String(submission.task);
    if (!byTask.has(key)) {
      byTask.set(key, normalizeSubmission(submission));
    }
  }
  return byTask;
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

// GET /api/trinetra/config — effective settings (any authenticated role).
router.get('/config', auth, async (req, res) => {
  try {
    const settings = await TrinetraConfig.getSettings();
    res.json({ success: true, config: settings, can_edit: isManager(req) });
  } catch (error) {
    console.error('[trinetra] config read failed:', error);
    res.status(500).json({ success: false, error: 'Failed to read TRINETRA config' });
  }
});

// PUT /api/trinetra/config — Admin/Manager only, partial patch.
router.put('/config', auth, requireAdmin, async (req, res) => {
  try {
    const settings = await TrinetraConfig.updateSettings(req.body || {}, req.user.id);
    await writeAudit(req.user.id, 'trinetra_config_update', 'trinetra/config', null);
    res.json({ success: true, config: settings });
  } catch (error) {
    console.error('[trinetra] config update failed:', error);
    res.status(400).json({ success: false, error: error.message || 'Failed to update TRINETRA config' });
  }
});

// GET /api/trinetra/agent/config — capture policy for the desktop agent.
router.get('/agent/config', auth, async (req, res) => {
  try {
    const settings = await TrinetraConfig.getSettings();
    const gate = await getMonitoringGate(req.user.id);
    const openDay = gate.allowed ? await findOpenAttendance(req.user.id) : null;
    const screenshot = settings.screenshot;

    res.json({
      success: true,
      allowed: gate.allowed,
      reason: gate.reason || null,
      day_active: !!openDay,
      capture: {
        // The agent only captures on its own when the mode explicitly includes periodic.
        periodic_enabled: screenshot.mode === 'periodic' || screenshot.mode === 'both',
        mode: screenshot.mode,
        interval_minutes: screenshot.interval_minutes,
        jitter_minutes: screenshot.jitter_minutes,
        dedupe_distance: screenshot.dedupe_distance,
        max_per_hour: screenshot.max_per_hour,
        capture_when_idle: screenshot.capture_when_idle,
        jpeg_quality: screenshot.jpeg_quality,
        max_upload_bytes: screenshot.max_upload_bytes,
        blocked_title_patterns: screenshot.blocked_title_patterns || []
      }
    });
  } catch (error) {
    console.error('[trinetra] agent config failed:', error);
    res.status(500).json({ success: false, error: 'Failed to read agent config' });
  }
});

// GET /api/trinetra/agent/tasks — active task + today's aims for the tray selector.
router.get('/agent/tasks', auth, async (req, res) => {
  try {
    const employeeId = req.user.id;
    if (!isValidObjectId(employeeId)) {
      return res.status(401).json({ success: false, error: 'Invalid session identity' });
    }

    const { start, end } = engine.getDayBounds(new Date());

    const [tasks, aims] = await Promise.all([
      Task.find({
        assignee: employeeId,
        status: { $in: ['Pending', 'In Progress', 'Submitted for Review', 'Returned'] }
      })
        .select('title status priority dueDate task_id progress')
        .sort({ dueDate: 1 })
        .limit(50)
        .lean(),
      Aim.find({ user: employeeId, date: { $gte: start, $lte: end } })
        .select('aims completionStatus date')
        .lean()
    ]);

    res.json({
      success: true,
      tasks: tasks.map((task) => ({
        id: String(task._id),
        task_id: task.task_id || String(task._id),
        title: task.title,
        status: task.status,
        priority: task.priority,
        due_date: task.dueDate || null,
        progress: task.progress || 0
      })),
      aims: aims.map((aim) => ({
        id: String(aim._id),
        text: aim.aims,
        completion_status: aim.completionStatus
      }))
    });
  } catch (error) {
    console.error('[trinetra] agent tasks failed:', error);
    res.status(500).json({ success: false, error: 'Failed to load assigned tasks' });
  }
});

/* ------------------------------------------------------------------ */
/* Agent ingest: periodic screenshot                                    */
/* ------------------------------------------------------------------ */

// POST /api/trinetra/agent/screenshot
router.post('/agent/screenshot', auth, async (req, res) => {
  try {
    const employeeId = req.user.id;
    if (!isValidObjectId(employeeId)) {
      return res.status(401).json({ success: false, error: 'Invalid session identity' });
    }

    const {
      image,
      signature,
      capturedAt,
      activeApp,
      windowTitle,
      sessionId,
      trigger
    } = req.body || {};

    if (!image || typeof image !== 'string') {
      return res.status(400).json({ success: false, error: 'image (base64) is required' });
    }

    const gate = await getMonitoringGate(employeeId);
    if (!gate.allowed) {
      return res.status(403).json({
        success: false,
        error: gate.reason === 'monitoring_paused'
          ? 'Monitoring is paused for this employee'
          : 'Monitoring consent is not active for this employee',
        code: 'MONITORING_BLOCKED',
        reason: gate.reason
      });
    }

    const openDay = await findOpenAttendance(employeeId);
    if (!openDay) {
      return res.status(403).json({
        success: false,
        error: 'Cannot accept captures: workday not started',
        code: 'DAY_NOT_ACTIVE'
      });
    }

    const settings = await TrinetraConfig.getSettings();
    const policy = settings.screenshot;

    const blocked = (policy.blocked_title_patterns || []).some((pattern) => {
      const needle = String(pattern || '').toLowerCase().trim();
      if (!needle) return false;
      return `${String(windowTitle || '').toLowerCase()} ${String(activeApp || '').toLowerCase()}`.includes(needle);
    });
    if (blocked) {
      return res.status(202).json({
        success: true,
        stored: false,
        skipped: 'privacy_blocked',
        message: 'Window matched a blocked title pattern; capture discarded'
      });
    }

    const base64Payload = image.includes(',') ? image.slice(image.indexOf(',') + 1) : image;
    let buffer;
    try {
      buffer = Buffer.from(base64Payload, 'base64');
    } catch (error) {
      return res.status(400).json({ success: false, error: 'Invalid base64 image payload' });
    }

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ success: false, error: 'Empty image payload' });
    }

    const maxBytes = Math.min(MAX_IMAGE_BYTES, policy.max_upload_bytes || MAX_IMAGE_BYTES);
    if (buffer.length > maxBytes) {
      return res.status(413).json({
        success: false,
        error: `Image exceeds the configured limit of ${Math.round(maxBytes / 1024)}KB`
      });
    }

    // Server-side rate limit so a misconfigured agent cannot flood storage.
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const capturesLastHour = await ScreenCapture.countDocuments({
      employee: employeeId,
      capture_trigger: 'scheduled',
      timestamp: { $gte: hourAgo }
    });
    if (capturesLastHour >= (policy.max_per_hour || 8)) {
      return res.status(429).json({
        success: false,
        error: 'Hourly capture budget exhausted',
        code: 'CAPTURE_RATE_LIMIT',
        max_per_hour: policy.max_per_hour
      });
    }

    // Server-side dedupe: authoritative dHash computed from the bytes we received.
    let serverHash = null;
    try {
      serverHash = await computeDHash(buffer);
    } catch (error) {
      console.warn('[trinetra] dHash computation failed, continuing without server signature:', error.message);
    }

    const previous = await ScreenCapture.findOne({ employee: employeeId })
      .sort({ timestamp: -1 })
      .select('timestamp file_hash metadata.screen_signature')
      .lean();

    if (previous && serverHash) {
      const previousSignature = (previous.metadata && previous.metadata.screen_signature) || null;
      const distance = previousSignature ? hammingDistance(serverHash, previousSignature) : 64;
      const withinWindow = previous.timestamp
        ? Date.now() - new Date(previous.timestamp).getTime() <= 30 * 60 * 1000
        : false;

      if (withinWindow && distance <= (policy.dedupe_distance || 5)) {
        return res.json({
          success: true,
          stored: false,
          skipped: 'duplicate_frame',
          distance,
          signature: serverHash,
          message: 'Screen unchanged since the last capture'
        });
      }
    }

    let processed;
    try {
      processed = await sharp(buffer)
        .jpeg({ quality: Math.min(policy.jpeg_quality || 70, 85), mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
    } catch (error) {
      return res.status(400).json({ success: false, error: 'Unsupported or corrupt image data' });
    }

    const dateStr = new Date().toISOString().split('T')[0];
    const dirPath = path.join(SCREENSHOT_BASE_PATH, String(employeeId), 'trinetra', dateStr);
    await fs.mkdir(dirPath, { recursive: true });

    const stamp = new Date();
    const filename = `trinetra_${stamp.getTime()}_${crypto.randomBytes(3).toString('hex')}.jpg`;
    const filePath = path.join(dirPath, filename);
    await fs.writeFile(filePath, processed.data);

    const fileHash = crypto.createHash('sha256').update(processed.data).digest('hex');

    const capture = await ScreenCapture.create({
      employee: employeeId,
      timestamp: capturedAt ? new Date(capturedAt) : stamp,
      file_path: filePath,
      file_size: processed.info.size,
      file_hash: fileHash,
      compression_ratio: buffer.length > 0 ? buffer.length / processed.info.size : 1,
      screen_resolution: { width: processed.info.width, height: processed.info.height },
      is_delta: !!previous,
      previous_capture: previous ? previous._id : undefined,
      active_application: {
        name: activeApp || 'Unknown',
        title: windowTitle || ''
      },
      session_id: sessionId || String(openDay._id),
      capture_trigger: 'scheduled',
      is_flagged: false,
      metadata: {
        blur_applied: false,
        privacy_level: 'full',
        intelligent_capture: false,
        trinetra_mode: 'periodic',
        screen_signature: serverHash || signature || null,
        app_category: engine.categorizeActivity(
          { active_application: { name: activeApp, title: windowTitle } },
          settings.app_rules
        ).category,
        client_signature: signature || null,
        requested_trigger: trigger || 'scheduled'
      }
    });

    res.status(201).json({
      success: true,
      stored: true,
      screenshot_id: String(capture._id),
      file_size: processed.info.size,
      signature: serverHash,
      duplicates_skipped: 0
    });
  } catch (error) {
    console.error('[trinetra] screenshot ingest failed:', error);
    res.status(500).json({ success: false, error: 'Failed to store screenshot' });
  }
});

/* ------------------------------------------------------------------ */
/* Live telemetry grid                                                  */
/* ------------------------------------------------------------------ */

// GET /api/trinetra/telemetry/live
router.get('/telemetry/live', auth, async (req, res) => {
  try {
    const scope = resolveScope(req, req.query.employeeId);
    if (scope.error) {
      return res.status(scope.status).json({ success: false, error: scope.error });
    }

    const settings = await TrinetraConfig.getSettings();
    const { start, end } = engine.getDayBounds(new Date());

    let users;
    if (scope.employeeId) {
      users = await attachDepartments(
        await User.find({ _id: scope.employeeId })
          .select('name email role department stillExist monitoringPaused')
          .lean()
      );
    } else {
      users = await attachDepartments(
        await User.find({ stillExist: 1, role: { $nin: ['Admin'] } })
          .select('name email role department stillExist monitoringPaused')
          .lean()
      );
    }

    if (users.length === 0) {
      return res.json({
        success: true,
        employees: [],
        summary: { total: 0, active: 0, idle: 0, away: 0, offline: 0 },
        generated_at: new Date(),
        config_source: settings.source
      });
    }

    const employeeIds = users.map((user) => user._id);

    const [latestActivities, openDays, latestCaptures] = await Promise.all([
      EmployeeActivity.aggregate([
        { $match: { employee: { $in: employeeIds }, timestamp: { $gte: start, $lte: end } } },
        // Prefer real ingest rows (session_id = 24-char attendanceId) over
        // derived rows: legacy synthetic sessions ("sess_<ts>") and EMS-built
        // rows ("ms_<uid>_<ts>") which carry zero counts and would otherwise
        // become the "latest" row, zeroing the rates of an active member.
        {
          $addFields: {
            is_agent_row: {
              $eq: [{ $strLenCP: { $ifNull: ['$session_id', ''] } }, 24]
            }
          }
        },
        { $sort: { is_agent_row: -1, timestamp: -1 } },
        {
          $group: {
            _id: '$employee',
            latest: { $first: '$$ROOT' },
            samples: { $sum: 1 },
            keystrokes: { $sum: '$keystroke_count' },
            mouse_events: { $sum: { $ifNull: ['$mouse_event_count', 0] } },
            last_ts: { $max: '$timestamp' }
          }
        }
      ]),
      Attendance.find({
        user: { $in: employeeIds },
        date: { $gte: start, $lte: end },
        startDayTime: { $exists: true },
        endDayTime: { $exists: false }
      })
        .select('user startDayTime')
        .lean(),
      ScreenCapture.aggregate([
        { $match: { employee: { $in: employeeIds }, timestamp: { $gte: start, $lte: end } } },
        { $group: { _id: '$employee', count: { $sum: 1 }, last_capture: { $max: '$timestamp' } } }
      ])
    ]);

    const activityByEmployee = new Map(latestActivities.map((row) => [String(row._id), row]));
    const openDayByEmployee = new Map(openDays.map((row) => [String(row.user), row]));
    const captureByEmployee = new Map(latestCaptures.map((row) => [String(row._id), row]));

    const idleThreshold = settings.scoring.idle_threshold_seconds || 120;
    const awayMinutes = Math.max(5, Math.round(idleThreshold / 60));
    const now = Date.now();

    const employees = users.map((user) => {
      const key = String(user._id);
      const activity = activityByEmployee.get(key);
      const openDay = openDayByEmployee.get(key);
      const capture = captureByEmployee.get(key);
      const latest = activity ? activity.latest : null;

      // Derived per-minute rates from the freshest sample. Prefer the stored
      // cadence fields; fall back to raw counts over the sample interval for
      // rows written before those fields existed.
      let keystrokesPerMin = null;
      let mousePerMin = null;
      let lastActivityAgeSeconds = null;
      if (latest) {
        const intervalSeconds = latest.interval_seconds || 30;
        keystrokesPerMin =
          typeof latest.keystroke_cadence === 'number'
            ? latest.keystroke_cadence
            : Math.round(((latest.keystroke_count || 0) / intervalSeconds) * 60);
        mousePerMin =
          typeof latest.mouse_cadence === 'number'
            ? latest.mouse_cadence
            : (latest.mouse_event_count || 0) > 0
              ? Math.round(((latest.mouse_event_count) / intervalSeconds) * 60)
              : // Legacy rows that stored only the 0-100 score (EMS flush before
                // mouse_event_count existed): score 100 ≈ 20 events / 30 s ≈ 40/min.
                latest.mouse_activity_score > 0
                  ? Math.round(latest.mouse_activity_score * 0.4)
                  : 0;
        lastActivityAgeSeconds = Math.max(0, Math.round((now - new Date(latest.timestamp).getTime()) / 1000));
      }
      const isStale = lastActivityAgeSeconds !== null && lastActivityAgeSeconds > 120;

      let status = 'offline';
      let idleSeconds = null;
      let activeApp = null;
      let appCategory = null;
      let taskId = null;
      if (openDay) {
        status = 'idle';
      }

      if (latest) {
        idleSeconds = latest.idle_duration || 0;
        activeApp = (latest.active_application && latest.active_application.name) || null;
        appCategory = engine.categorizeActivity(latest, settings.app_rules).category;
        taskId = latest.task_id || null;

        const minutesSinceActivity = (now - new Date(latest.timestamp).getTime()) / 60000;
        if (!openDay) {
          status = minutesSinceActivity <= 15 ? 'active' : 'offline';
        } else if (minutesSinceActivity >= awayMinutes * 2) {
          status = 'away';
        } else if (idleSeconds >= idleThreshold) {
          status = 'idle';
        } else {
          status = 'active';
        }
      }

      if (user.monitoringPaused === true) {
        status = 'monitoring_paused';
      }

      return {
        employee_id: key,
        name: user.name,
        email: user.email,
        department: user.department && user.department.name ? user.department.name : null,
        status,
        day_active: !!openDay,
        day_started_at: openDay ? openDay.startDayTime : null,
        last_seen_at: latest ? latest.timestamp : null,
        idle_seconds: idleSeconds,
        active_app: activeApp,
        active_category: appCategory,
        active_task_id: taskId,
        samples_today: activity ? activity.samples : 0,
        keystrokes_today: activity ? activity.keystrokes : 0,
        mouse_events_today: activity ? activity.mouse_events : 0,
        keystrokes_per_min: keystrokesPerMin,
        mouse_per_min: mousePerMin,
        last_activity_age_seconds: lastActivityAgeSeconds,
        stale: isStale,
        captures_today: capture ? capture.count : 0,
        last_capture_at: capture ? capture.last_capture : null,
        monitoring_paused: user.monitoringPaused === true
      };
    });

    const summary = employees.reduce(
      (acc, employee) => {
        acc.total += 1;
        if (employee.status === 'active') acc.active += 1;
        else if (employee.status === 'idle') acc.idle += 1;
        else if (employee.status === 'away') acc.away += 1;
        else acc.offline += 1;
        return acc;
      },
      { total: 0, active: 0, idle: 0, away: 0, offline: 0 }
    );

    res.json({
      success: true,
      employees: employees.sort((a, b) => a.name.localeCompare(b.name)),
      summary,
      generated_at: new Date(),
      config_source: settings.source
    });
  } catch (error) {
    console.error('[trinetra] live telemetry failed:', error);
    res.status(500).json({ success: false, error: 'Failed to build live telemetry' });
  }
});

/* ------------------------------------------------------------------ */
/* Productivity / tri-factor scoring                                    */
/* ------------------------------------------------------------------ */

async function buildProductivityRows(settings, users, start, end) {
  const employeeIds = users.map((user) => user._id);

  const [activities, tasks] = await Promise.all([
    loadActivities(employeeIds, start, end),
    loadTasksForWindow(employeeIds, start, end)
  ]);

  const submissionsByTask = await loadSubmissionsByTask(tasks.map((task) => task._id));
  const activitiesByEmployee = groupBy(activities, (activity) => String(activity.employee));
  const tasksByEmployee = groupBy(tasks, (task) => String(task.assignee));

  return users.map((user) => {
    const key = String(user._id);
    const employeeActivities = activitiesByEmployee.get(key) || [];
    const employeeTasks = tasksByEmployee.get(key) || [];

    const activitySummary = engine.summarizeActivities(employeeActivities, settings);

    const taskSecondsByTaskId = new Map(
      Object.entries(activitySummary.task_seconds || {}).map(([taskId, seconds]) => [String(taskId), seconds])
    );
    const verificationRows = engine.buildVerificationRows(
      employeeTasks,
      submissionsByTask,
      taskSecondsByTaskId
    );
    const deliverableSummary = engine.verificationToDeliverables(verificationRows);
    const score = engine.computeProductivityScore(activitySummary, deliverableSummary, settings);

    return {
      employee_id: key,
      employeeId: user.employeeId || formatEmployeeId(user.email),
      name: user.name,
      email: user.email,
      department: user.department && user.department.name ? user.department.name : null,
      monitoring_paused: user.monitoringPaused === true,
      activity: activitySummary,
      deliverables: deliverableSummary,
      score,
      verification_summary: {
        total: verificationRows.length,
        verified: verificationRows.filter((row) => row.verification === 'verified').length,
        evidence_missing: verificationRows.filter((row) => row.verification === 'evidence_missing').length,
        overdue: verificationRows.filter((row) => row.verification === 'overdue').length
      }
    };
  });
}

// GET /api/trinetra/productivity/summary?range=daily|weekly&date=...&department=...
router.get('/productivity/summary', auth, async (req, res) => {
  try {
    const settings = await TrinetraConfig.getSettings();
    const range = String(req.query.range || 'daily').toLowerCase();
    const anchor = parseDateParam(req.query.date);
    const { start, end } = engine.getPeriodBounds(range, anchor);

    let users;
    if (isManager(req)) {
      const query = { stillExist: 1, role: { $nin: ['Admin'] } };
      if (req.query.department && req.query.department !== 'all' && isValidObjectId(req.query.department)) {
        query.department = req.query.department;
      }
      users = await attachDepartments(
        await User.find(query)
          .select('name email role department stillExist monitoringPaused')
          .lean()
      );
    } else {
      users = await attachDepartments(
        await User.find({ _id: req.user.id })
          .select('name email role department stillExist monitoringPaused')
          .lean()
      );
    }

    const rows = await buildProductivityRows(settings, users, start, end);

    const scored = rows.filter((row) => typeof row.score.score === 'number');
    const teamScore = scored.length
      ? engine.round(scored.reduce((sum, row) => sum + row.score.score, 0) / scored.length, 1)
      : null;

    res.json({
      success: true,
      range,
      period: { start, end },
      scoring_model: {
        focus_weight: settings.scoring.focus_weight,
        intensity_weight: settings.scoring.intensity_weight,
        deliverable_weight: settings.scoring.deliverable_weight,
        idle_threshold_seconds: settings.scoring.idle_threshold_seconds
      },
      team: {
        employees: rows.length,
        scored: scored.length,
        insufficient_data: rows.length - scored.length,
        average_score: teamScore,
        active_minutes: engine.round(
          rows.reduce((sum, row) => sum + (row.activity.active_minutes || 0), 0),
          1
        ),
        idle_minutes: engine.round(
          rows.reduce((sum, row) => sum + (row.activity.idle_minutes || 0), 0),
          1
        )
      },
      employees: rows.sort((a, b) => {
        const aScore = typeof a.score.score === 'number' ? a.score.score : -1;
        const bScore = typeof b.score.score === 'number' ? b.score.score : -1;
        return bScore - aScore;
      }),
      generated_at: new Date()
    });
  } catch (error) {
    console.error('[trinetra] productivity summary failed:', error);
    res.status(500).json({ success: false, error: 'Failed to build productivity summary' });
  }
});

// GET /api/trinetra/productivity/employee/:employeeId?range=daily&date=...
router.get('/productivity/employee/:employeeId', auth, async (req, res) => {
  try {
    const scope = resolveScope(req, req.params.employeeId);
    if (scope.error) {
      return res.status(scope.status).json({ success: false, error: scope.error });
    }

    const settings = await TrinetraConfig.getSettings();
    const range = String(req.query.range || 'daily').toLowerCase();
    const anchor = parseDateParam(req.query.date);
    const { start, end } = engine.getPeriodBounds(range, anchor);

    const users = await attachDepartments(
      await User.find({ _id: scope.employeeId })
        .select('name email role department stillExist monitoringPaused')
        .lean()
    );

    if (!users.length) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    const [row] = await buildProductivityRows(settings, users, start, end);
    const activities = await loadActivities([scope.employeeId], start, end);

    res.json({
      success: true,
      range,
      period: { start, end },
      employee: row,
      timeline: engine.buildTimeline(activities, settings),
      idle_clusters: engine.buildIdleClusters(activities, settings),
      generated_at: new Date()
    });
  } catch (error) {
    console.error('[trinetra] employee productivity failed:', error);
    res.status(500).json({ success: false, error: 'Failed to build employee productivity' });
  }
});

// GET /api/trinetra/timeline/:employeeId?date=YYYY-MM-DD
router.get('/timeline/:employeeId', auth, async (req, res) => {
  try {
    const scope = resolveScope(req, req.params.employeeId);
    if (scope.error) {
      return res.status(scope.status).json({ success: false, error: scope.error });
    }

    const settings = await TrinetraConfig.getSettings();
    const { start, end } = engine.getDayBounds(parseDateParam(req.query.date));
    const activities = await loadActivities([scope.employeeId], start, end);

    res.json({
      success: true,
      employee_id: scope.employeeId,
      date: start,
      segments: engine.buildTimeline(activities, settings),
      idle_clusters: engine.buildIdleClusters(activities, settings),
      summary: engine.summarizeActivities(activities, settings)
    });
  } catch (error) {
    console.error('[trinetra] timeline failed:', error);
    res.status(500).json({ success: false, error: 'Failed to build timeline' });
  }
});

/* ------------------------------------------------------------------ */
/* Screenshot gallery                                                   */
/* ------------------------------------------------------------------ */

// GET /api/trinetra/screenshots?employeeId=&date=&type=periodic|violation|all
router.get('/screenshots', auth, async (req, res) => {
  try {
    const scope = resolveScope(req, req.query.employeeId);
    if (scope.error) {
      return res.status(scope.status).json({ success: false, error: scope.error });
    }

    const { start, end } = engine.getDayBounds(parseDateParam(req.query.date));
    const type = String(req.query.type || 'periodic').toLowerCase();
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const query = {
      timestamp: { $gte: start, $lte: end }
    };

    // Managers may omit employeeId for a team-wide gallery; `employee: null`
    // would match nothing, so only filter when a subject is in scope.
    if (scope.employeeId) {
      query.employee = scope.employeeId;
    }

    if (type === 'periodic') {
      query['metadata.trinetra_mode'] = 'periodic';
    } else if (type === 'violation') {
      query['metadata.intelligent_capture'] = true;
    }

    const [captures, total] = await Promise.all([
      ScreenCapture.find(query)
        .sort({ timestamp: -1 })
        .skip(offset)
        .limit(limit)
        .select('-metadata.encryption_key')
        .lean(),
      ScreenCapture.countDocuments(query)
    ]);

    res.json({
      success: true,
      employee_id: scope.employeeId,
      date: start,
      type,
      total,
      limit,
      offset,
      screenshots: captures.map((capture) => ({
        id: String(capture._id),
        timestamp: capture.timestamp,
        trigger: capture.capture_trigger,
        flagged: capture.is_flagged,
        flag_reason: capture.flag_reason || null,
        app: (capture.active_application && capture.active_application.name) || null,
        title: (capture.active_application && capture.active_application.title) || null,
        category: (capture.metadata && capture.metadata.app_category) || null,
        signature: (capture.metadata && capture.metadata.screen_signature) || null,
        file_size: capture.file_size,
        url: `/api/trinetra/screenshots/${capture._id}`
      }))
    });
  } catch (error) {
    console.error('[trinetra] screenshot list failed:', error);
    res.status(500).json({ success: false, error: 'Failed to list screenshots' });
  }
});

// GET /api/trinetra/screenshots/:screenshotId — RBAC-guarded file/redirect.
router.get('/screenshots/:screenshotId', auth, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.screenshotId)) {
      return res.status(400).json({ success: false, error: 'Invalid screenshot id' });
    }

    const capture = await ScreenCapture.findById(req.params.screenshotId).lean();
    if (!capture) {
      return res.status(404).json({ success: false, error: 'Screenshot not found' });
    }

    if (!isManager(req) && String(capture.employee) !== String(req.user.id)) {
      return res.status(403).json({ success: false, error: 'Not authorized to view this screenshot' });
    }

    await writeAudit(req.user.id, 'trinetra_screenshot_view', 'trinetra/screenshot', capture._id);

    if (capture.metadata && capture.metadata.cloudinary_url) {
      return res.redirect(capture.metadata.cloudinary_url);
    }

    try {
      await fs.access(capture.file_path);
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: 'Screenshot file is no longer on disk',
        message: 'It may have been purged by the retention policy'
      });
    }

    const buffer = await fs.readFile(capture.file_path);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.setHeader('Content-Disposition', `inline; filename="trinetra_${capture._id}.jpg"`);
    return res.send(buffer);
  } catch (error) {
    console.error('[trinetra] screenshot fetch failed:', error);
    res.status(500).json({ success: false, error: 'Failed to serve screenshot' });
  }
});

/* ------------------------------------------------------------------ */
/* Completion verification matrix                                       */
/* ------------------------------------------------------------------ */

// GET /api/trinetra/verification/matrix?range=daily|weekly&date=&employeeId=
router.get('/verification/matrix', auth, async (req, res) => {
  try {
    const settings = await TrinetraConfig.getSettings();
    const range = String(req.query.range || 'weekly').toLowerCase();
    const { start, end } = engine.getPeriodBounds(range, parseDateParam(req.query.date));

    let users;
    if (isManager(req)) {
      const query = { stillExist: 1, role: { $nin: ['Admin'] } };
      if (req.query.employeeId) {
        if (!isValidObjectId(req.query.employeeId)) {
          return res.status(400).json({ success: false, error: 'Invalid employeeId' });
        }
        query._id = req.query.employeeId;
      }
      if (req.query.department && req.query.department !== 'all' && isValidObjectId(req.query.department)) {
        query.department = req.query.department;
      }
      users = await attachDepartments(
        await User.find(query)
          .select('name email department stillExist')
          .lean()
      );
    } else {
      users = await attachDepartments(
        await User.find({ _id: req.user.id })
          .select('name email department stillExist')
          .lean()
      );
    }

    if (!users.length) {
      return res.json({ success: true, range, period: { start, end }, employees: [], summary: null });
    }

    const employeeIds = users.map((user) => user._id);
    const [tasks, activities] = await Promise.all([
      loadTasksForWindow(employeeIds, start, end),
      loadActivities(employeeIds, start, end)
    ]);

    const submissionsByTask = await loadSubmissionsByTask(tasks.map((task) => task._id));
    const tasksByEmployee = groupBy(tasks, (task) => String(task.assignee));
    const activitiesByEmployee = groupBy(activities, (activity) => String(activity.employee));

    const employees = users.map((user) => {
      const key = String(user._id);
      const employeeTasks = tasksByEmployee.get(key) || [];
      const employeeActivities = activitiesByEmployee.get(key) || [];

      const taskSeconds = {};
      for (const activity of employeeActivities) {
        if (!activity.task_id) continue;
        const seconds = engine.intervalSeconds(activity);
        const isIdle = engine.isIdleInterval(activity, settings.scoring.idle_threshold_seconds || 120);
        if (isIdle) continue;
        const taskKey = String(activity.task_id);
        taskSeconds[taskKey] = (taskSeconds[taskKey] || 0) + seconds;
      }

      const rows = engine.buildVerificationRows(
        employeeTasks,
        submissionsByTask,
        new Map(Object.entries(taskSeconds))
      );
      const deliverables = engine.verificationToDeliverables(rows);
      const trackedMinutes = engine.round(
        rows.reduce((sum, row) => sum + row.tracked_minutes, 0),
        1
      );

      return {
        employee_id: key,
        name: user.name,
        email: user.email,
        department: user.department && user.department.name ? user.department.name : null,
        tasks: rows.sort((a, b) => {
          const aDue = a.due_date ? new Date(a.due_date).getTime() : 0;
          const bDue = b.due_date ? new Date(b.due_date).getTime() : 0;
          return aDue - bDue;
        }),
        deliverables,
        tracked_minutes: trackedMinutes,
        evidence_coverage:
          deliverables.assigned > 0
            ? engine.round((deliverables.with_evidence / deliverables.assigned) * 100, 1)
            : null
      };
    });

    const totalTasks = employees.reduce((sum, row) => sum + row.tasks.length, 0);
    const verifiedTasks = employees.reduce(
      (sum, row) => sum + row.tasks.filter((task) => task.verification === 'verified').length,
      0
    );
    const evidenceMissing = employees.reduce(
      (sum, row) => sum + row.tasks.filter((task) => task.verification === 'evidence_missing').length,
      0
    );
    const overdueTasks = employees.reduce(
      (sum, row) => sum + row.tasks.filter((task) => task.verification === 'overdue').length,
      0
    );

    res.json({
      success: true,
      range,
      period: { start, end },
      summary: {
        employees: employees.length,
        tasks: totalTasks,
        verified: verifiedTasks,
        evidence_missing: evidenceMissing,
        overdue: overdueTasks,
        verification_rate: totalTasks > 0 ? engine.round((verifiedTasks / totalTasks) * 100, 1) : null
      },
      employees
    });
  } catch (error) {
    console.error('[trinetra] verification matrix failed:', error);
    res.status(500).json({ success: false, error: 'Failed to build verification matrix' });
  }
});

/* ------------------------------------------------------------------ */
/* Automated alerts                                                     */
/* ------------------------------------------------------------------ */

/**
 * Evaluate TRINETRA alert rules against live data and persist new alerts into the
 * existing `monitoring_alerts` collection (no new alert schema). Each rule uses a
 * stable dedupe key plus a cooldown so a stuck task cannot spam the stream.
 */
async function runAlertEvaluation(options = {}) {
  const settings = await TrinetraConfig.getSettings();
  if (!settings.alerts.enabled) {
    return { enabled: false, evaluated: 0, created: 0, skipped: 0, alerts: [] };
  }

  const now = new Date();
  const { start, end } = engine.getDayBounds(now);
  const cooldownMs = (settings.alerts.cooldown_minutes || 120) * 60 * 1000;
  const cooldownSince = new Date(now.getTime() - cooldownMs);

  const userQuery = { stillExist: 1, monitoringPaused: { $ne: true }, role: { $nin: ['Admin'] } };
  if (options.employeeId) {
    if (!isValidObjectId(options.employeeId)) {
      return { enabled: true, evaluated: 0, created: 0, skipped: 0, alerts: [], error: 'Invalid employeeId' };
    }
    userQuery._id = options.employeeId;
  }

  const users = await attachDepartments(
    await User.find(userQuery)
      .select('name email department')
      .lean()
  );

  if (!users.length) {
    return { enabled: true, evaluated: 0, created: 0, skipped: 0, alerts: [] };
  }

  const employeeIds = users.map((user) => user._id);

  const [openDays, lastActivities, inProgressTasks] = await Promise.all([
    Attendance.find({
      user: { $in: employeeIds },
      date: { $gte: start, $lte: end },
      startDayTime: { $exists: true },
      endDayTime: { $exists: false }
    })
      .select('user startDayTime')
      .lean(),
    EmployeeActivity.aggregate([
      { $match: { employee: { $in: employeeIds }, timestamp: { $gte: start } } },
      { $sort: { timestamp: -1 } },
      { $group: { _id: '$employee', last_ts: { $max: '$timestamp' } } }
    ]),
    Task.find({
      assignee: { $in: employeeIds },
      status: { $in: engine.TASK_OPEN_STATUSES }
    })
      .select('title status dueDate updatedAt assignee task_id createdAt')
      .lean()
  ]);

  const openDayByEmployee = new Map(openDays.map((row) => [String(row.user), row]));
  const lastActivityByEmployee = new Map(lastActivities.map((row) => [String(row._id), row.last_ts]));
  const inactivityMs = (settings.alerts.inactivity_minutes || 45) * 60 * 1000;

  // Batch-load today's activity rows once for every candidate instead of
  // issuing one query per employee inside the loop (N+1), which made the
  // sweep slow exactly when many candidates were being analysed.
  const dayActivityRows = await EmployeeActivity.find({
    employee: { $in: employeeIds },
    timestamp: { $gte: start, $lte: end }
  })
    .select(
      'employee timestamp keystroke_count mouse_activity_score mouse_event_count idle_duration active_application app_category interval_seconds'
    )
    .lean();
  const dayActivitiesByEmployee = new Map();
  const latestSampleByEmployee = new Map();
  for (const row of dayActivityRows) {
    const rowKey = String(row.employee);
    if (!dayActivitiesByEmployee.has(rowKey)) {
      dayActivitiesByEmployee.set(rowKey, []);
    }
    dayActivitiesByEmployee.get(rowKey).push(row);

    // Track the freshest sample in the same pass so the still rule does not have
    // to re-scan (and re-sort) a full day of 5-second samples per employee.
    const previous = latestSampleByEmployee.get(rowKey);
    if (!previous || new Date(row.timestamp).getTime() >= new Date(previous.timestamp).getTime()) {
      latestSampleByEmployee.set(rowKey, row);
    }
  }

  const candidates = [];

  for (const user of users) {
    const key = String(user._id);
    const openDay = openDayByEmployee.get(key);
    const lastActivity = lastActivityByEmployee.get(key);

    // Rule: inactivity during an open workday.
    if (openDay) {
      const reference = lastActivity
        ? new Date(lastActivity).getTime()
        : new Date(openDay.startDayTime).getTime();
      const gapMs = now.getTime() - reference;
      if (gapMs >= inactivityMs) {
        const gapMinutes = Math.round(gapMs / 60000);
        candidates.push({
          employee: user._id,
          alert_type: 'idle_timeout',
          severity: gapMinutes >= settings.alerts.inactivity_minutes * 2 ? 'high' : 'medium',
          title: 'Prolonged inactivity during workday',
          description: `${user.name} has had no recorded activity for ${gapMinutes} minutes while their workday is still open.`,
          data: {
            idle_duration: Math.round(gapMs / 1000),
            trinetra_key: `inactivity:${key}:${start.toISOString().split('T')[0]}`,
            trinetra_rule: 'inactivity',
            last_activity_at: lastActivity || null,
            day_started_at: openDay.startDayTime
          },
          session_id: String(openDay._id)
        });
      }

      // Rule: keyboard/mouse still for N minutes (default 5).
      //
      // The inactivity rule above watches for telemetry that *stops arriving*.
      // With a 5-second heartbeat that never triggers for an idle employee — the
      // rows keep coming with keystroke_count 0. This rule reads the freshest
      // sample's idle_duration instead, so "mouse still for 5 minutes" surfaces
      // within one evaluation tick of the threshold being crossed.
      const stillMinutesSetting = settings.alerts.still_minutes || 5;
      const stillThresholdSeconds = stillMinutesSetting * 60;
      const latestSample = latestSampleByEmployee.get(key) || null;

      let stillSeconds = 0;
      if (latestSample) {
        const reportedIdle = Number(latestSample.idle_duration) || 0;
        // A sample that stopped arriving (asleep, agent killed) is still evidence
        // of stillness, so measure from its timestamp as well.
        const sinceSample = Math.round(
          (now.getTime() - new Date(latestSample.timestamp).getTime()) / 1000
        );
        stillSeconds = Math.max(reportedIdle, sinceSample);
      } else {
        stillSeconds = Math.round((now.getTime() - new Date(openDay.startDayTime).getTime()) / 1000);
      }

      if (stillSeconds >= stillThresholdSeconds) {
        const stillForMinutes = Math.round(stillSeconds / 60);
        // One alert per 30-minute block while the employee stays still: frequent
        // enough to be useful, sparse enough not to flood the dashboard.
        const stillBucket = Math.floor(now.getTime() / (30 * 60 * 1000));
        candidates.push({
          employee: user._id,
          alert_type: 'idle_timeout',
          severity: stillSeconds >= stillThresholdSeconds * 2 ? 'high' : 'medium',
          title: 'Keyboard and mouse still',
          description: `${user.name} has recorded no keyboard or mouse input for ${stillForMinutes} minutes (threshold ${stillMinutesSetting} min) while their workday is open.`,
          data: {
            idle_duration: stillSeconds,
            trinetra_key: `still:${key}:${start.toISOString().split('T')[0]}:${stillBucket}`,
            trinetra_rule: 'still',
            still_minutes: stillMinutesSetting,
            last_activity_at: latestSample ? latestSample.timestamp : null,
            day_started_at: openDay.startDayTime
          },
          session_id: String(openDay._id)
        });
      }
    }

    // Rule: low focus ratio with enough signal to be honest about it.
    const dayActivities = dayActivitiesByEmployee.get(key) || [];

    if (dayActivities.length > 0) {
      const summary = engine.summarizeActivities(dayActivities, settings);
      if (
        summary.data_quality.sufficient &&
        typeof summary.focus_ratio === 'number' &&
        summary.focus_ratio < settings.alerts.low_focus_percent
      ) {
        candidates.push({
          employee: user._id,
          alert_type: 'productivity_drop',
          severity: summary.focus_ratio < settings.alerts.low_focus_percent / 2 ? 'high' : 'medium',
          title: 'Low focus ratio detected',
          description: `${user.name} spent ${summary.focus_ratio}% of active time in focus applications today (threshold ${settings.alerts.low_focus_percent}%).`,
          data: {
            productivity_score: summary.focus_ratio,
            focus_ratio: summary.focus_ratio,
            distraction_ratio: summary.distraction_ratio,
            active_minutes: summary.active_minutes,
            trinetra_key: `low_focus:${key}:${start.toISOString().split('T')[0]}`,
            trinetra_rule: 'low_focus'
          }
        });
      }
    }
  }

  // Rule: stalled in-progress tasks (no progress recorded inside the window).
  const stallMs = (settings.alerts.stalled_task_hours || 24) * 60 * 60 * 1000;
  const graceMs = (settings.alerts.overdue_grace_hours || 4) * 60 * 60 * 1000;

  for (const task of inProgressTasks) {
    const owner = users.find((user) => String(user._id) === String(task.assignee));
    if (!owner) continue;

    const taskKey = String(task.task_id || task._id);
    const lastProgress = new Date(task.updatedAt || task.createdAt || now).getTime();
    if (now.getTime() - lastProgress >= stallMs) {
      const stalledHours = Math.round((now.getTime() - lastProgress) / 3600000);
      candidates.push({
        employee: owner._id,
        alert_type: 'task_reminder',
        severity: 'medium',
        title: 'Task appears stalled',
        description: `"${task.title}" has had no progress recorded for ${stalledHours} hours.`,
        data: {
          trinetra_key: `stalled_task:${taskKey}`,
          trinetra_rule: 'stalled_task',
          task_id: taskKey,
          stalled_hours: stalledHours,
          due_date: task.dueDate || null
        },
        related_task: task._id
      });
    }

    if (task.dueDate && now.getTime() > new Date(task.dueDate).getTime() + graceMs) {
      const overdueHours = Math.round((now.getTime() - new Date(task.dueDate).getTime()) / 3600000);
      candidates.push({
        employee: owner._id,
        alert_type: 'task_reminder',
        severity: overdueHours > 48 ? 'high' : 'medium',
        title: 'Task is overdue',
        description: `"${task.title}" is ${overdueHours} hours past its due date and still ${task.status}.`,
        data: {
          trinetra_key: `overdue_task:${taskKey}`,
          trinetra_rule: 'overdue_task',
          task_id: taskKey,
          overdue_hours: overdueHours,
          due_date: task.dueDate
        },
        related_task: task._id
      });
    }
  }

  // Persist with dedupe + cooldown.
  const created = [];
  let skipped = 0;

  for (const candidate of candidates) {
    const dedupeKey = candidate.data.trinetra_key;
    const existing = await MonitoringAlert.findOne({
      employee: candidate.employee,
      alert_type: candidate.alert_type,
      timestamp: { $gte: cooldownSince },
      'data.trinetra_key': dedupeKey
    })
      .select('_id status')
      .lean();

    if (existing) {
      skipped += 1;
      continue;
    }

    try {
      // Created directly (not via createAlert) because the model's 5-minute helper
      // merges by employee+type, which would collapse distinct rule hits. The
      // TRINETRA dedupe/cooldown above already guarantees a single live alert per key.
      const alert = await MonitoringAlert.create({
        ...candidate,
        auto_generated: true,
        notification_channels: ['dashboard']
      });
      created.push({
        id: String(alert._id),
        employee: String(alert.employee),
        alert_type: alert.alert_type,
        title: alert.title,
        severity: alert.severity,
        key: dedupeKey
      });
    } catch (error) {
      console.warn('[trinetra] alert persist failed:', error.message);
      skipped += 1;
    }
  }

  return {
    enabled: true,
    evaluated: users.length,
    candidates: candidates.length,
    created: created.length,
    skipped,
    alerts: created,
    ran_at: now
  };
}

// GET /api/trinetra/alerts — unified stream.
router.get('/alerts', auth, async (req, res) => {
  try {
    const scope = resolveScope(req, req.query.employeeId);
    if (scope.error) {
      return res.status(scope.status).json({ success: false, error: scope.error });
    }

    const { start } = engine.getDayBounds(parseDateParam(req.query.date));
    const status = String(req.query.status || 'open').toLowerCase();
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

    const query = { timestamp: { $gte: start } };
    if (scope.employeeId) {
      query.employee = scope.employeeId;
    }
    if (status === 'open') {
      query.status = { $in: ['active', 'acknowledged'] };
    } else if (status !== 'all') {
      query.status = status;
    }

    const [alerts, counts] = await Promise.all([
      MonitoringAlert.find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .populate('employee', 'name email department')
        .populate('related_task', 'title status dueDate task_id')
        .lean(),
      MonitoringAlert.aggregate([
        { $match: query },
        { $group: { _id: { type: '$alert_type', status: '$status' }, count: { $sum: 1 } } }
      ])
    ]);

    res.json({
      success: true,
      range_start: start,
      status_filter: status,
      counts,
      alerts: alerts.map((alert) => ({
        id: String(alert._id),
        employee: alert.employee
          ? { id: String(alert.employee._id), name: alert.employee.name, email: alert.employee.email }
          : null,
        type: alert.alert_type,
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        status: alert.status,
        timestamp: alert.timestamp,
        rule: (alert.data && alert.data.trinetra_rule) || null,
        key: (alert.data && alert.data.trinetra_key) || null,
        task: alert.related_task
          ? {
              id: String(alert.related_task._id),
              title: alert.related_task.title,
              status: alert.related_task.status,
              due_date: alert.related_task.dueDate || null
            }
          : null
      }))
    });
  } catch (error) {
    console.error('[trinetra] alerts read failed:', error);
    res.status(500).json({ success: false, error: 'Failed to read alerts' });
  }
});

// POST /api/trinetra/alerts/evaluate — manual trigger for the rule engine.
router.post('/alerts/evaluate', auth, requireAdmin, async (req, res) => {
  try {
    const result = await runAlertEvaluation({ employeeId: req.body && req.body.employeeId });
    schedulerState.last_result = result;
    schedulerState.last_run_at = new Date();
    res.json({ success: true, result });
  } catch (error) {
    console.error('[trinetra] alert evaluation failed:', error);
    res.status(500).json({ success: false, error: 'Failed to evaluate alert rules' });
  }
});

async function updateAlertStatus(req, res, status) {
  try {
    if (!isValidObjectId(req.params.alertId)) {
      return res.status(400).json({ success: false, error: 'Invalid alert id' });
    }

    const alert = await MonitoringAlert.findById(req.params.alertId);
    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

    if (!isManager(req) && String(alert.employee) !== String(req.user.id)) {
      return res.status(403).json({ success: false, error: 'Not authorized to change this alert' });
    }

    const notes = (req.body && req.body.notes) || '';
    const updated = status === 'resolved'
      ? await alert.resolve(req.user.id, notes)
      : await alert.acknowledge(req.user.id, notes);

    return res.json({ success: true, alert: { id: String(updated._id), status: updated.status } });
  } catch (error) {
    console.error('[trinetra] alert status update failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to update alert' });
  }
}

router.put('/alerts/:alertId/acknowledge', auth, requireAdmin, (req, res) =>
  updateAlertStatus(req, res, 'acknowledged')
);

router.put('/alerts/:alertId/resolve', auth, requireAdmin, (req, res) =>
  updateAlertStatus(req, res, 'resolved')
);

/* ------------------------------------------------------------------ */
/* Retention                                                            */
/* ------------------------------------------------------------------ */

/**
 * Purge TRINETRA periodic captures past the configured retention window.
 * Deliberately scoped to `metadata.trinetra_mode: 'periodic'` so violation
 * evidence (which may be needed for policy/legal review) is never touched by
 * this layer — its lifecycle stays with the existing monitoring service.
 */
async function runRetentionSweep() {
  const settings = await TrinetraConfig.getSettings();
  const days = Math.max(1, Number(settings.screenshot.retention_days) || 90);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const stale = await ScreenCapture.find({
    timestamp: { $lt: cutoff },
    'metadata.trinetra_mode': 'periodic'
  })
    .select('_id file_path')
    .lean();

  if (stale.length === 0) {
    return { retention_days: days, cutoff, deleted: 0 };
  }

  for (const capture of stale) {
    if (!capture.file_path) continue;
    try {
      await fs.unlink(capture.file_path);
    } catch (error) {
      // A missing file must not block the metadata purge.
    }
  }

  const deletion = await ScreenCapture.deleteMany({ _id: { $in: stale.map((capture) => capture._id) } });

  return { retention_days: days, cutoff, deleted: deletion.deletedCount };
}

/* ------------------------------------------------------------------ */
/* Operational status (monitorability)                                  */
/* ------------------------------------------------------------------ */

// GET /api/trinetra/status — is the layer actually receiving data?
router.get('/status', auth, requireManager, async (req, res) => {
  try {
    const settings = await TrinetraConfig.getSettings();
    const { start, end } = engine.getDayBounds(new Date());
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Same population for numerator and denominator: non-admin, not paused.
    const eligible = await User.find({
      stillExist: 1,
      role: { $nin: ['Admin'] },
      monitoringPaused: { $ne: true }
    })
      .select('_id')
      .lean();
    const eligibleIds = eligible.map((row) => row._id);

    const [
      activityRowsToday,
      distinctActives,
      capturesToday,
      periodicCapturesToday,
      openAlerts,
      agentsSeenLastHour
    ] = await Promise.all([
      EmployeeActivity.countDocuments({ timestamp: { $gte: start, $lte: end } }),
      EmployeeActivity.distinct('employee', {
        timestamp: { $gte: start, $lte: end },
        employee: { $in: eligibleIds }
      }),
      ScreenCapture.countDocuments({ timestamp: { $gte: start, $lte: end } }),
      ScreenCapture.countDocuments({
        timestamp: { $gte: start, $lte: end },
        'metadata.trinetra_mode': 'periodic'
      }),
      MonitoringAlert.countDocuments({ status: { $in: ['active', 'acknowledged'] } }),
      EmployeeActivity.distinct('employee', {
        timestamp: { $gte: hourAgo },
        employee: { $in: eligibleIds }
      })
    ]);

    const activeUsers = eligibleIds.length;

    res.json({
      success: true,
      layer: 'trinetra',
      version: '1.0.0',
      config: {
        source: settings.source,
        updated_at: settings.updated_at,
        screenshot_mode: settings.screenshot.mode
      },
      telemetry: {
        active_employees: activeUsers,
        activity_rows_today: activityRowsToday,
        employees_reporting_today: distinctActives.length,
        employees_reporting_last_hour: agentsSeenLastHour.length,
        coverage_percent:
          activeUsers > 0 ? engine.round((distinctActives.length / activeUsers) * 100, 1) : null
      },
      screenshots: {
        mode: settings.screenshot.mode,
        periodic_enabled: settings.screenshot.mode === 'periodic' || settings.screenshot.mode === 'both',
        captured_today: capturesToday,
        periodic_today: periodicCapturesToday,
        interval_minutes: settings.screenshot.interval_minutes,
        max_per_hour: settings.screenshot.max_per_hour
      },
      alerts: {
        enabled: settings.alerts.enabled,
        open: openAlerts,
        scheduler: {
          running: schedulerState.running,
          last_run_at: schedulerState.last_run_at,
          last_created: schedulerState.last_result ? schedulerState.last_result.created : null,
          interval_seconds: schedulerState.interval_seconds,
          last_error: schedulerState.last_error,
          last_retention_at: schedulerState.last_retention_at,
          last_retention_deleted: schedulerState.last_retention_deleted
        }
      },
      generated_at: new Date()
    });
  } catch (error) {
    console.error('[trinetra] status failed:', error);
    res.status(500).json({ success: false, error: 'Failed to read TRINETRA status' });
  }
});

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// GET /api/trinetra/report/export?format=csv&range=daily|weekly&date=
router.get('/report/export', auth, requireAdmin, async (req, res) => {
  try {
    const settings = await TrinetraConfig.getSettings();
    const range = String(req.query.range || 'weekly').toLowerCase();
    const { start, end } = engine.getPeriodBounds(range, parseDateParam(req.query.date));

    const users = await attachDepartments(
      await User.find({ stillExist: 1, role: { $nin: ['Admin'] } })
        .select('name email role department stillExist monitoringPaused employeeId')
        .lean()
    );

    const rows = await buildProductivityRows(settings, users, start, end);

    const header = [
      'Employee ID',
      'Employee',
      'Email',
      'Department',
      'Active Minutes',
      'Idle Minutes',
      'Focus %',
      'Distraction %',
      'Intensity',
      'Keystrokes/min',
      'Tasks Assigned',
      'Tasks Completed',
      'On-time Tasks',
      'Tasks With Evidence',
      'Deliverable %',
      'TRINETRA Score',
      'Data Quality',
      'Monitoring Paused'
    ];

    const lines = [header.join(',')];
    for (const row of rows) {
      lines.push(
        [
          csvEscape(row.employeeId || formatEmployeeId(row.email)),
          csvEscape(row.name),
          csvEscape(row.email),
          csvEscape(row.department || ''),
          row.activity.active_minutes,
          row.activity.idle_minutes,
          row.activity.focus_ratio,
          row.activity.distraction_ratio,
          row.activity.intensity,
          row.activity.keystrokes_per_minute,
          row.deliverables.assigned,
          row.deliverables.completed,
          row.deliverables.on_time,
          row.deliverables.with_evidence,
          row.deliverables.completion_rate,
          row.score.score === null ? '' : row.score.score,
          row.activity.data_quality.confidence,
          row.monitoring_paused ? 'yes' : 'no'
        ].join(',')
      );
    }

    const stamp = start.toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="trinetra_${range}_${stamp}.csv"`
    );
    await writeAudit(req.user.id, 'trinetra_report_export', 'trinetra/report', null);
    res.send(lines.join('\n'));
  } catch (error) {
    console.error('[trinetra] export failed:', error);
    res.status(500).json({ success: false, error: 'Failed to export report' });
  }
});

/* ------------------------------------------------------------------ */
/* Scheduler                                                           */
/* ------------------------------------------------------------------ */

/**
 * Periodic rule evaluation so alerts are automated rather than dashboard-triggered.
 * Interval comes from config and is re-read on every tick, so an Admin can tune it
 * without a restart. Failures are recorded, never thrown.
 */
function startTrinetraScheduler() {
  if (schedulerHandle) {
    return schedulerState;
  }

  let stopped = false;

  const scheduleNext = (delayMs) => {
    if (stopped) return;
    schedulerHandle = setTimeout(tick, delayMs);
    if (schedulerHandle.unref) schedulerHandle.unref();
  };

  const tick = async () => {
    let delayMs = 15 * 60 * 1000;
    try {
      const settings = await TrinetraConfig.getSettings();
      // Seconds-based cadence: a 5-minute still threshold cannot be detected by a
      // sweep that only runs every 15 minutes.
      const configuredSeconds = settings.alerts.evaluation_interval_seconds || 30;
      delayMs = Math.max(10, configuredSeconds) * 1000;
      schedulerState.interval_seconds = Math.max(10, configuredSeconds);

      if (settings.alerts.enabled) {
        const result = await runAlertEvaluation({});
        schedulerState.last_run_at = new Date();
        schedulerState.last_result = result;
        schedulerState.last_error = null;
        if (result.created > 0) {
          console.log(`🧿 TRINETRA alert sweep: ${result.created} new, ${result.skipped} deduped`);
        }
      }

      // Retention runs at most once a day, independently of the alert cadence.
      const lastRetention = schedulerState.last_retention_at
        ? new Date(schedulerState.last_retention_at).getTime()
        : 0;
      if (Date.now() - lastRetention > 24 * 60 * 60 * 1000) {
        try {
          const purge = await runRetentionSweep();
          schedulerState.last_retention_at = new Date();
          schedulerState.last_retention_deleted = purge.deleted;
          if (purge.deleted > 0) {
            console.log(`🧿 TRINETRA retention: purged ${purge.deleted} periodic capture(s) older than ${purge.retention_days}d`);
          }
        } catch (error) {
          console.warn('[trinetra] retention sweep failed:', error.message);
        }
      }
    } catch (error) {
      schedulerState.last_error = error.message;
      console.warn('[trinetra] scheduler tick failed:', error.message);
    } finally {
      // Re-read config each cycle so cadence changes apply without a restart.
      scheduleNext(delayMs);
    }
  };

  schedulerState.running = true;
  schedulerState.interval_seconds = 30;
  console.log('🧿 TRINETRA scheduler started (alert sweep, cadence from config)');

  // First sweep shortly after boot, then a self-rescheduling cadence.
  scheduleNext(15 * 1000);

  return schedulerState;
}

function stopTrinetraScheduler() {
  if (schedulerHandle) {
    clearTimeout(schedulerHandle);
    schedulerHandle = null;
  }
  schedulerState.running = false;
}

module.exports = {
  router,
  startTrinetraScheduler,
  stopTrinetraScheduler,
  runAlertEvaluation,
  runRetentionSweep,
  getSchedulerState: () => ({ ...schedulerState })
};
