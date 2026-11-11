const mongoose = require('mongoose');

/**
 * TRINETRA AI — configuration surface.
 *
 * Design rules (see TRINETRA_ACTIVATION_PLAN.md):
 *  - This collection is OPTIONAL. If no document exists, `getSettings()` returns the
 *    in-code defaults below. Nothing is seeded into MongoDB, so a fresh environment
 *    never contains fabricated policy rows.
 *  - Every operational knob (capture cadence, taxonomy, weights, alert thresholds)
 *    is editable at runtime by an Admin/Manager through PUT /api/trinetra/config.
 *  - Defaults are *policy*, not data: no employee telemetry or scores are invented.
 */

const APP_CATEGORIES = [
  'FOCUS',
  'DOCUMENTATION',
  'COMMUNICATION',
  'SUPPORT',
  'DISTRACTION',
  'NEUTRAL',
  'SYSTEM'
];

const CAPTURE_MODES = ['intelligent', 'periodic', 'both'];
const MATCH_FIELDS = ['app', 'title', 'any'];

/**
 * Ordered policy defaults. First match wins, so the list is ordered from most
 * specific/risky to least specific (browser shells last so an in-app title such as
 * "pull request - GitHub" resolves to FOCUS instead of the browser's NEUTRAL).
 */
const DEFAULT_APP_RULES = [
  // Distraction first — explicit signals win over shell containers.
  { pattern: 'youtube', field: 'any', category: 'DISTRACTION', label: 'YouTube' },
  { pattern: 'netflix', field: 'any', category: 'DISTRACTION', label: 'Netflix' },
  { pattern: 'prime video', field: 'any', category: 'DISTRACTION', label: 'Prime Video' },
  { pattern: 'hotstar', field: 'any', category: 'DISTRACTION', label: 'Hotstar' },
  { pattern: 'instagram', field: 'any', category: 'DISTRACTION', label: 'Instagram' },
  { pattern: 'facebook', field: 'any', category: 'DISTRACTION', label: 'Facebook' },
  { pattern: 'twitter', field: 'any', category: 'DISTRACTION', label: 'Twitter/X' },
  { pattern: 'tiktok', field: 'any', category: 'DISTRACTION', label: 'TikTok' },
  { pattern: 'reddit', field: 'any', category: 'DISTRACTION', label: 'Reddit' },
  { pattern: 'twitch', field: 'any', category: 'DISTRACTION', label: 'Twitch' },
  { pattern: 'pinterest', field: 'any', category: 'DISTRACTION', label: 'Pinterest' },
  { pattern: 'spotify', field: 'any', category: 'DISTRACTION', label: 'Spotify' },
  { pattern: 'snapchat', field: 'any', category: 'DISTRACTION', label: 'Snapchat' },

  // Engineering / delivery evidence.
  { pattern: 'github', field: 'any', category: 'FOCUS', label: 'GitHub' },
  { pattern: 'gitlab', field: 'any', category: 'FOCUS', label: 'GitLab' },
  { pattern: 'bitbucket', field: 'any', category: 'FOCUS', label: 'Bitbucket' },
  { pattern: 'stack overflow', field: 'any', category: 'FOCUS', label: 'Stack Overflow' },
  { pattern: 'visual studio', field: 'app', category: 'FOCUS', label: 'Visual Studio' },
  { pattern: 'vs code', field: 'app', category: 'FOCUS', label: 'VS Code' },
  { pattern: 'code', field: 'app', category: 'FOCUS', label: 'Code Editor' },
  { pattern: 'cursor', field: 'app', category: 'FOCUS', label: 'Cursor' },
  { pattern: 'intellij', field: 'app', category: 'FOCUS', label: 'IntelliJ' },
  { pattern: 'pycharm', field: 'app', category: 'FOCUS', label: 'PyCharm' },
  { pattern: 'webstorm', field: 'app', category: 'FOCUS', label: 'WebStorm' },
  { pattern: 'sublime', field: 'app', category: 'FOCUS', label: 'Sublime Text' },
  { pattern: 'android studio', field: 'app', category: 'FOCUS', label: 'Android Studio' },
  { pattern: 'xcode', field: 'app', category: 'FOCUS', label: 'Xcode' },
  { pattern: 'postman', field: 'any', category: 'FOCUS', label: 'Postman' },
  { pattern: 'docker', field: 'app', category: 'FOCUS', label: 'Docker' },
  { pattern: 'terminal', field: 'app', category: 'FOCUS', label: 'Terminal' },
  { pattern: 'powershell', field: 'app', category: 'FOCUS', label: 'PowerShell' },
  { pattern: 'command prompt', field: 'app', category: 'FOCUS', label: 'Command Prompt' },
  { pattern: 'mongodb', field: 'any', category: 'FOCUS', label: 'MongoDB' },
  { pattern: 'mysql', field: 'any', category: 'FOCUS', label: 'MySQL' },
  { pattern: 'pgadmin', field: 'any', category: 'FOCUS', label: 'pgAdmin' },
  { pattern: 'jupyter', field: 'any', category: 'FOCUS', label: 'Jupyter' },

  // Documentation / planning.
  { pattern: 'notion', field: 'any', category: 'DOCUMENTATION', label: 'Notion' },
  { pattern: 'confluence', field: 'any', category: 'DOCUMENTATION', label: 'Confluence' },
  { pattern: 'jira', field: 'any', category: 'DOCUMENTATION', label: 'Jira' },
  { pattern: 'linear', field: 'any', category: 'DOCUMENTATION', label: 'Linear' },
  { pattern: 'asana', field: 'any', category: 'DOCUMENTATION', label: 'Asana' },
  { pattern: 'trello', field: 'any', category: 'DOCUMENTATION', label: 'Trello' },
  { pattern: 'figma', field: 'any', category: 'DOCUMENTATION', label: 'Figma' },
  { pattern: 'word', field: 'app', category: 'DOCUMENTATION', label: 'Word' },
  { pattern: 'excel', field: 'app', category: 'DOCUMENTATION', label: 'Excel' },
  { pattern: 'powerpoint', field: 'app', category: 'DOCUMENTATION', label: 'PowerPoint' },
  { pattern: 'google docs', field: 'any', category: 'DOCUMENTATION', label: 'Google Docs' },
  { pattern: 'google sheets', field: 'any', category: 'DOCUMENTATION', label: 'Google Sheets' },
  { pattern: 'acrobat', field: 'app', category: 'DOCUMENTATION', label: 'Acrobat' },
  { pattern: 'obsidian', field: 'app', category: 'DOCUMENTATION', label: 'Obsidian' },

  // Communication.
  { pattern: 'slack', field: 'any', category: 'COMMUNICATION', label: 'Slack' },
  { pattern: 'teams', field: 'any', category: 'COMMUNICATION', label: 'Microsoft Teams' },
  { pattern: 'outlook', field: 'any', category: 'COMMUNICATION', label: 'Outlook' },
  { pattern: 'gmail', field: 'any', category: 'COMMUNICATION', label: 'Gmail' },
  { pattern: 'zoom', field: 'any', category: 'COMMUNICATION', label: 'Zoom' },
  { pattern: 'google meet', field: 'any', category: 'COMMUNICATION', label: 'Google Meet' },
  { pattern: 'webex', field: 'any', category: 'COMMUNICATION', label: 'Webex' },
  { pattern: 'discord', field: 'any', category: 'COMMUNICATION', label: 'Discord' },
  { pattern: 'whatsapp', field: 'any', category: 'COMMUNICATION', label: 'WhatsApp' },
  { pattern: 'telegram', field: 'any', category: 'COMMUNICATION', label: 'Telegram' },

  // Support / service desks.
  { pattern: 'servicenow', field: 'any', category: 'SUPPORT', label: 'ServiceNow' },
  { pattern: 'freshdesk', field: 'any', category: 'SUPPORT', label: 'Freshdesk' },
  { pattern: 'zendesk', field: 'any', category: 'SUPPORT', label: 'Zendesk' },

  // Operating-system surfaces.
  { pattern: 'task manager', field: 'any', category: 'SYSTEM', label: 'Task Manager' },
  { pattern: 'settings', field: 'any', category: 'SYSTEM', label: 'System Settings' },
  { pattern: 'explorer', field: 'app', category: 'SYSTEM', label: 'File Explorer' },
  { pattern: 'finder', field: 'app', category: 'SYSTEM', label: 'Finder' },
  { pattern: 'desktop', field: 'app', category: 'SYSTEM', label: 'Desktop' },
  { pattern: 'lock screen', field: 'any', category: 'SYSTEM', label: 'Lock Screen' },

  // Browser shells last: unresolved web activity is neutral, not "productive".
  { pattern: 'chrome', field: 'app', category: 'NEUTRAL', label: 'Google Chrome' },
  { pattern: 'msedge', field: 'app', category: 'NEUTRAL', label: 'Microsoft Edge' },
  { pattern: 'edge', field: 'app', category: 'NEUTRAL', label: 'Microsoft Edge' },
  { pattern: 'firefox', field: 'app', category: 'NEUTRAL', label: 'Firefox' },
  { pattern: 'safari', field: 'app', category: 'NEUTRAL', label: 'Safari' },
  { pattern: 'browser', field: 'app', category: 'NEUTRAL', label: 'Browser' }
];

const appRuleSchema = new mongoose.Schema(
  {
    pattern: { type: String, required: true, trim: true },
    field: { type: String, enum: MATCH_FIELDS, default: 'any' },
    category: { type: String, enum: APP_CATEGORIES, required: true },
    label: { type: String, trim: true }
  },
  { _id: false }
);

const trinetraConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'global',
      unique: true,
      index: true
    },
    screenshot: {
      // 'intelligent' keeps the existing violation-only behaviour.
      // 'periodic' enables scheduled capture from the desktop agent.
      // 'both' (default) runs scheduled baselines plus violation captures, so a
      // fresh environment produces the random-interval snapshots the
      // monitoring programme requires without an Admin having to opt in first.
      mode: { type: String, enum: CAPTURE_MODES, default: 'both' },
      interval_minutes: { type: Number, min: 1, max: 240, default: 10 },
      // Randomised extra delay so captures do not land on a predictable clock.
      jitter_minutes: { type: Number, min: 0, max: 60, default: 5 },
      // Hamming distance (0-64) under which a dHash is treated as "same screen".
      dedupe_distance: { type: Number, min: 0, max: 64, default: 5 },
      max_per_hour: { type: Number, min: 1, max: 60, default: 8 },
      capture_when_idle: { type: Boolean, default: false },
      retention_days: { type: Number, min: 1, max: 365, default: 90 },
      max_upload_bytes: { type: Number, min: 10240, max: 5242880, default: 512000 },
      jpeg_quality: { type: Number, min: 30, max: 95, default: 70 },
      // Window-title fragments that are never captured (privacy hard-stop).
      blocked_title_patterns: { type: [String], default: [] }
    },
    app_rules: {
      type: [appRuleSchema],
      default: DEFAULT_APP_RULES
    },
    scoring: {
      focus_weight: { type: Number, min: 0, max: 1, default: 0.4 },
      intensity_weight: { type: Number, min: 0, max: 1, default: 0.3 },
      deliverable_weight: { type: Number, min: 0, max: 1, default: 0.3 },
      target_keystrokes_per_minute: { type: Number, min: 1, max: 600, default: 60 },
      idle_threshold_seconds: { type: Number, min: 30, max: 3600, default: 120 },
      min_active_minutes_for_score: { type: Number, min: 1, max: 480, default: 5 }
    },
    alerts: {
      enabled: { type: Boolean, default: true },
      stalled_task_hours: { type: Number, min: 1, max: 168, default: 24 },
      overdue_grace_hours: { type: Number, min: 0, max: 72, default: 4 },
      // Inactivity = telemetry stopped arriving (agent dead, laptop asleep).
      inactivity_minutes: { type: Number, min: 5, max: 240, default: 45 },
      // Still = heartbeat alive but no keyboard/mouse input for this long.
      // This is the "mouse still for more than 5 minutes" alert.
      still_minutes: { type: Number, min: 1, max: 120, default: 5 },
      low_focus_percent: { type: Number, min: 0, max: 100, default: 40 },
      cooldown_minutes: { type: Number, min: 5, max: 1440, default: 120 },
      // Seconds, not minutes: a 5-minute still threshold is useless if the sweep
      // only runs every 15 minutes. 30 s bounds the detection lag to one tick.
      evaluation_interval_seconds: { type: Number, min: 10, max: 900, default: 30 },
      // Deprecated: superseded by evaluation_interval_seconds. Kept so stored
      // documents and older clients that still send it do not fail validation.
      evaluation_interval_minutes: { type: Number, min: 5, max: 180, default: 15 }
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true,
    collection: 'trinetra_configs'
  }
);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Merge a partial patch onto a base object, only keeping keys that already exist
 * in the base schema. Unknown keys are dropped instead of being persisted blindly.
 */
function mergeKnown(base, patch) {
  const out = { ...base };
  if (!isPlainObject(patch)) {
    return out;
  }
  for (const key of Object.keys(patch)) {
    if (!(key in base)) {
      continue;
    }
    if (isPlainObject(base[key]) && isPlainObject(patch[key])) {
      out[key] = mergeKnown(base[key], patch[key]);
    } else if (Array.isArray(base[key]) && Array.isArray(patch[key]) && key !== 'app_rules') {
      out[key] = patch[key];
    } else if (key !== 'app_rules') {
      out[key] = patch[key];
    }
  }
  return out;
}

function defaults() {
  // Build defaults through the schema so every default/cast/min is applied once.
  const doc = new this({ key: 'global' });
  return {
    screenshot: doc.screenshot.toObject ? doc.screenshot.toObject() : { ...doc.screenshot },
    app_rules: DEFAULT_APP_RULES.map((rule) => ({ ...rule })),
    scoring: doc.scoring.toObject ? doc.scoring.toObject() : { ...doc.scoring },
    alerts: doc.alerts.toObject ? doc.alerts.toObject() : { ...doc.alerts }
  };
}

/**
 * Read the effective settings. Never writes, so reading config has no side effects
 * and an untouched environment stays empty (no seeding).
 */
trinetraConfigSchema.statics.getSettings = async function () {
  const base = defaults.call(this);
  const stored = await this.findOne({ key: 'global' }).lean();
  if (!stored) {
    return { ...base, source: 'defaults', updated_at: null, updated_by: null };
  }

  return {
    screenshot: mergeKnown(base.screenshot, stored.screenshot),
    app_rules: Array.isArray(stored.app_rules) && stored.app_rules.length > 0
      ? stored.app_rules
      : base.app_rules,
    scoring: mergeKnown(base.scoring, stored.scoring),
    alerts: mergeKnown(base.alerts, stored.alerts),
    source: 'database',
    updated_at: stored.updatedAt || null,
    updated_by: stored.updated_by || null
  };
};

/**
 * Validate and persist a partial update. Returns the effective settings.
 */
trinetraConfigSchema.statics.updateSettings = async function (patch, updatedBy) {
  const current = await this.getSettings();
  const allowed = {};

  if (isPlainObject(patch.screenshot)) {
    allowed.screenshot = mergeKnown(current.screenshot, patch.screenshot);
  }
  if (isPlainObject(patch.scoring)) {
    allowed.scoring = mergeKnown(current.scoring, patch.scoring);
  }
  if (isPlainObject(patch.alerts)) {
    allowed.alerts = mergeKnown(current.alerts, patch.alerts);
  }
  if (Array.isArray(patch.app_rules)) {
    allowed.app_rules = patch.app_rules
      .filter((rule) => rule && rule.pattern && APP_CATEGORIES.includes(rule.category))
      .map((rule) => ({
        pattern: String(rule.pattern).trim(),
        field: MATCH_FIELDS.includes(rule.field) ? rule.field : 'any',
        category: rule.category,
        label: rule.label ? String(rule.label).trim() : ''
      }));
  }

  const doc = await this.findOneAndUpdate(
    { key: 'global' },
    { $set: { ...allowed, updated_by: updatedBy || null } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();

  const base = defaults.call(this);
  return {
    screenshot: mergeKnown(base.screenshot, doc.screenshot),
    app_rules: Array.isArray(doc.app_rules) && doc.app_rules.length > 0 ? doc.app_rules : base.app_rules,
    scoring: mergeKnown(base.scoring, doc.scoring),
    alerts: mergeKnown(base.alerts, doc.alerts),
    source: 'database',
    updated_at: doc.updatedAt || null,
    updated_by: doc.updated_by || null
  };
};

module.exports = mongoose.model('TrinetraConfig', trinetraConfigSchema);
module.exports.APP_CATEGORIES = APP_CATEGORIES;
module.exports.CAPTURE_MODES = CAPTURE_MODES;
module.exports.DEFAULT_APP_RULES = DEFAULT_APP_RULES;
