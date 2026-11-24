/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Telemetry Aggregator & Privacy Gate
 *
 * Implements Phase C Telemetry Aggregation:
 * 1. Combines native foreground app durations, idle seconds, and input counts.
 * 2. Maps executables/applications to high-level work categories.
 * 3. Enforces strict privacy invariant: Rejects any sample containing forbidden fields
 *    (text, keystrokes, screenshot, image, base64, clipboard, url).
 * 4. Ensures zero double-counting.
 */

export const WORK_CATEGORIES = Object.freeze({
  DEVELOPMENT: 'DEVELOPMENT',
  DOCUMENTATION: 'DOCUMENTATION',
  COMMUNICATION: 'COMMUNICATION',
  SUPPORT: 'SUPPORT',
  NEUTRAL: 'NEUTRAL',
  EXCLUDED_PERSONAL: 'EXCLUDED_PERSONAL',
});

// Default process-to-category mapping
export const DEFAULT_CATEGORY_MAP = Object.freeze({
  'Visual Studio Code': WORK_CATEGORIES.DEVELOPMENT,
  'Code.exe': WORK_CATEGORIES.DEVELOPMENT,
  'Visual Studio': WORK_CATEGORIES.DEVELOPMENT,
  'devenv.exe': WORK_CATEGORIES.DEVELOPMENT,
  'Windows Terminal': WORK_CATEGORIES.DEVELOPMENT,
  'PowerShell': WORK_CATEGORIES.DEVELOPMENT,
  'Command Prompt': WORK_CATEGORIES.DEVELOPMENT,
  'Git Bash': WORK_CATEGORIES.DEVELOPMENT,
  'Postman': WORK_CATEGORIES.DEVELOPMENT,
  'Docker Desktop': WORK_CATEGORIES.DEVELOPMENT,

  'Slack': WORK_CATEGORIES.COMMUNICATION,
  'Microsoft Teams': WORK_CATEGORIES.COMMUNICATION,
  'teams.exe': WORK_CATEGORIES.COMMUNICATION,
  'Zoom': WORK_CATEGORIES.COMMUNICATION,

  'Microsoft Word': WORK_CATEGORIES.DOCUMENTATION,
  'Microsoft Excel': WORK_CATEGORIES.DOCUMENTATION,
  'Microsoft PowerPoint': WORK_CATEGORIES.DOCUMENTATION,
  'Notepad': WORK_CATEGORIES.DOCUMENTATION,
  'Notepad++': WORK_CATEGORIES.DOCUMENTATION,

  'Google Chrome': WORK_CATEGORIES.NEUTRAL,
  'Microsoft Edge': WORK_CATEGORIES.NEUTRAL,
  'Mozilla Firefox': WORK_CATEGORIES.NEUTRAL,
  'Windows Explorer': WORK_CATEGORIES.NEUTRAL,
});

export class TelemetryAggregator {
  constructor(options = {}) {
    this.categoryMap = { ...DEFAULT_CATEGORY_MAP, ...(options.categoryMap || {}) };
  }

  categorizeApp(appName) {
    if (!appName) return WORK_CATEGORIES.NEUTRAL;
    if (this.categoryMap[appName]) return this.categoryMap[appName];

    // Fallback classification based on common naming
    const lower = appName.toLowerCase();
    if (lower.includes('code') || lower.includes('studio') || lower.includes('terminal') || lower.includes('git')) {
      return WORK_CATEGORIES.DEVELOPMENT;
    }
    if (lower.includes('slack') || lower.includes('teams') || lower.includes('mail') || lower.includes('outlook') || lower.includes('zoom')) {
      return WORK_CATEGORIES.COMMUNICATION;
    }
    if (lower.includes('word') || lower.includes('excel') || lower.includes('sheet') || lower.includes('doc') || lower.includes('pdf')) {
      return WORK_CATEGORIES.DOCUMENTATION;
    }

    return WORK_CATEGORIES.NEUTRAL;
  }

  /**
   * Builds a canonical telemetry sample combining app metrics and input counts.
   *
   * @param {Object} params
   * @param {string} params.sessionId
   * @param {string} params.deviceId
   * @param {Object} params.appMetrics - From Win32Monitor.flushWindowMetrics()
   * @param {Object} params.inputMetrics - From NativeInputCounterContract.flushWindowMetrics()
   * @returns {Object} Canonical telemetry sample
   */
  aggregateWindow({ sessionId, deviceId, appMetrics, inputMetrics }) {
    if (!sessionId || !deviceId) {
      throw new Error('sessionId and deviceId are required for telemetry aggregation');
    }

    const apps = (appMetrics.apps || []).map((app) => ({
      name: app.name,
      durationSeconds: app.durationSeconds,
      category: this.categorizeApp(app.name),
    }));

    // Identify primary active application and category
    const topApp = apps.length > 0 ? apps[0] : null;
    const activeProcessCategory = topApp ? topApp.category : WORK_CATEGORIES.NEUTRAL;

    const sample = {
      sessionId,
      deviceId,
      timestamp: new Date().toISOString(),
      durationSeconds: appMetrics.windowDurationSeconds || 60,
      keyPressCount: inputMetrics.keyPresses || 0,
      mouseActivityDelta: (inputMetrics.mouseClicks || 0) + (inputMetrics.mouseScrollDelta || 0),
      hardwareIdleSeconds: appMetrics.idleSeconds || 0,
      hardwareLockSeconds: appMetrics.lockSeconds || 0,
      activeSeconds: appMetrics.totalActiveSeconds || 0,
      activeProcessCategory,
      apps,
    };

    // Strict privacy assert
    this.assertPrivacyInvariants(sample);

    return sample;
  }

  /**
   * Enforces privacy invariants: Rejects any sample containing forbidden fields.
   */
  assertPrivacyInvariants(sample) {
    const forbidden = ['text', 'keystrokes', 'screenshot', 'image', 'base64', 'clipboard', 'url', 'windowTitle', 'tabTitle'];
    for (const key of forbidden) {
      if (Object.prototype.hasOwnProperty.call(sample, key)) {
        throw new Error(`CRITICAL PRIVACY VIOLATION: Sample contains forbidden field "${key}"`);
      }
    }

    // Verify apps list doesn't contain window titles or paths
    if (Array.isArray(sample.apps)) {
      for (const a of sample.apps) {
        if (a.title || a.url || a.path) {
          throw new Error('CRITICAL PRIVACY VIOLATION: App record contains title, url, or file path');
        }
      }
    }

    return true;
  }
}

export default TelemetryAggregator;
