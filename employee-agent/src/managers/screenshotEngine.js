/**
 * TRINETRA Screenshot Engine (Electron main process)
 *
 * Periodic, low-impact screen capture with client-side deduplication.
 *
 * Design:
 *  - Uses Electron's built-in `desktopCapturer` (no new native dependency).
 *  - Computes a 64-bit dHash from the captured frame and skips the upload when the
 *    screen is perceptually unchanged, so a static editor does not burn storage.
 *  - Compresses to JPEG and steps quality down until the payload fits the policy
 *    limit supplied by the backend (`/api/trinetra/agent/config`).
 *  - Never captures while the workday is closed, while monitoring is paused, while
 *    the user is idle (unless policy allows it), or when the focused window matches
 *    a blocked title pattern.
 *  - Polls policy from the backend so cadence/mode/masking is managed centrally.
 */

const { EventEmitter } = require('events');
const { desktopCapturer, powerMonitor } = require('electron');
const activeAppWatcher = require('../utils/activeAppWatcher');

const DEFAULT_POLICY = {
  periodic_enabled: false,
  mode: 'intelligent',
  interval_minutes: 15,
  jitter_minutes: 5,
  dedupe_distance: 5,
  max_per_hour: 8,
  capture_when_idle: false,
  jpeg_quality: 70,
  max_upload_bytes: 512000,
  blocked_title_patterns: []
};

const POLICY_REFRESH_MS = 5 * 60 * 1000;
const IDLE_THRESHOLD_SECONDS = 120;

class ScreenshotEngine extends EventEmitter {
  constructor(apiService) {
    super();
    this.apiService = apiService;
    this.policy = { ...DEFAULT_POLICY };
    this.isRunning = false;
    this.attendanceId = null;
    this.activeTaskId = null;

    this.timer = null;
    this.policyTimer = null;
    this.lastSignature = null;
    this.lastCaptureAt = null;
    this.nextCaptureAt = null;
    this.uploadCount = 0;
    this.skippedCount = 0;
    this.duplicateCount = 0;
    this.failureCount = 0;
    this.consecutiveFailures = 0;
    this.lastError = null;
    this.capturing = false;

    this.startedAt = null;
  }

  /**
   * @param {string} attendanceId - open attendance record for the current workday
   */
  async start(attendanceId) {
    if (this.isRunning) {
      this.attendanceId = attendanceId || this.attendanceId;
      return;
    }

    this.attendanceId = attendanceId;
    this.isRunning = true;
    this.startedAt = new Date();
    this.consecutiveFailures = 0;

    console.log('📸 TRINETRA screenshot engine started');
    await this.refreshPolicy();

    this.policyTimer = setInterval(() => {
      this.refreshPolicy().catch(() => {});
    }, POLICY_REFRESH_MS);

    this.scheduleNext({ initial: true });
    this.emit('status', this.getStatus());
  }

  stop() {
    this.isRunning = false;
    this.attendanceId = null;
    this.nextCaptureAt = null;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.policyTimer) {
      clearInterval(this.policyTimer);
      this.policyTimer = null;
    }

    console.log('📸 TRINETRA screenshot engine stopped');
    this.emit('status', this.getStatus());
  }

  setActiveTask(taskId) {
    this.activeTaskId = taskId ? String(taskId) : null;
  }

  async refreshPolicy() {
    try {
      const config = await this.apiService.fetchAgentConfig();
      if (!config) return;

      if (config.allowed === false) {
        // Consent withdrawn or monitoring paused: stop capturing immediately.
        if (this.isRunning) {
          console.log(`📸 Capture halted by policy (${config.reason || 'not allowed'})`);
          this.stop();
        }
        return;
      }

      if (config.capture) {
        this.policy = { ...DEFAULT_POLICY, ...config.capture };
      }

      // Re-arm with the new cadence if the interval changed.
      if (this.isRunning && this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
        this.scheduleNext({});
      }

      this.emit('status', this.getStatus());
    } catch (error) {
      // A policy fetch failure must not stop capture; keep the last known policy.
      console.warn('📸 Could not refresh capture policy:', error.message);
    }
  }

  scheduleNext({ initial = false } = {}) {
    if (!this.isRunning) return;

    if (!this.policy.periodic_enabled) {
      this.nextCaptureAt = null;
      // Period mode is off (intelligent-only). Re-check when policy refreshes.
      this.emit('status', this.getStatus());
      return;
    }

    const baseMinutes = Math.max(1, Number(this.policy.interval_minutes) || 15);
    const jitterMinutes = Math.max(0, Number(this.policy.jitter_minutes) || 0);
    const jitter = jitterMinutes > 0 ? Math.random() * jitterMinutes : 0;
    // First capture lands after a short warm-up so login is not captured instantly.
    const delayMs = initial
      ? Math.min(2 * 60 * 1000, baseMinutes * 60 * 1000)
      : (baseMinutes + jitter) * 60 * 1000;

    this.nextCaptureAt = new Date(Date.now() + delayMs);

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.captureOnce('scheduled')
        .catch((error) => console.warn('📸 Capture tick failed:', error.message))
        .finally(() => this.scheduleNext({}));
    }, delayMs);

    this.emit('status', this.getStatus());
  }

  isBlockedWindow(appName, windowTitle) {
    const patterns = this.policy.blocked_title_patterns || [];
    if (patterns.length === 0) return false;
    const haystack = `${String(appName || '')} ${String(windowTitle || '')}`.toLowerCase();
    return patterns.some((pattern) => {
      const needle = String(pattern || '').toLowerCase().trim();
      return needle.length > 0 && haystack.includes(needle);
    });
  }

  /** 64-bit dHash from a NativeImage, returned as 16 hex chars. */
  dHash(image) {
    const small = image.resize({ width: 9, height: 8, quality: 'good' });
    const bitmap = small.toBitmap();
    const { width, height } = small.getSize();

    if (width !== 9 || height !== 8 || !bitmap || bitmap.length < 9 * 8 * 4) {
      return null;
    }

    // BGRA, 4 bytes per pixel.
    let bits = '';
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const leftOffset = (row * 9 + col) * 4;
        const rightOffset = (row * 9 + col + 1) * 4;
        const left = bitmap[leftOffset];
        const right = bitmap[rightOffset];
        bits += left > right ? '1' : '0';
      }
    }

    let hex = '';
    for (let i = 0; i < 64; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex;
  }

  hamming(hashA, hashB) {
    if (!hashA || !hashB || hashA.length !== hashB.length) return 64;
    let distance = 0;
    for (let i = 0; i < hashA.length; i += 1) {
      let xor = parseInt(hashA[i], 16) ^ parseInt(hashB[i], 16);
      while (xor) {
        distance += xor & 1;
        xor >>= 1;
      }
    }
    return distance;
  }

  compressToLimit(image, maxBytes) {
    const limit = Math.max(20 * 1024, Number(maxBytes) || DEFAULT_POLICY.max_upload_bytes);
    let quality = Math.min(Math.max(Number(this.policy.jpeg_quality) || 70, 30), 90);
    let buffer = image.toJPEG(quality);

    while (buffer.length > limit && quality > 30) {
      quality -= 10;
      buffer = image.toJPEG(quality);
    }

    return { buffer, quality };
  }

  async grabScreen() {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1600, height: 1000 },
      fetchWindowIcons: false
    });

    if (!sources || sources.length === 0) {
      throw new Error('No screen sources available (permission or headless session)');
    }

    const source = sources[0];
    const image = source.thumbnail;
    if (!image || image.isEmpty()) {
      throw new Error('Empty capture thumbnail (screen recording permission may be denied)');
    }

    return image;
  }

  async captureOnce(trigger = 'scheduled') {
    if (!this.isRunning || this.capturing) {
      return { captured: false, reason: 'not_running' };
    }
    if (!this.attendanceId) {
      return { captured: false, reason: 'day_not_active' };
    }

    const idleSeconds = (() => {
      try {
        return powerMonitor.getSystemIdleTime();
      } catch (error) {
        return 0;
      }
    })();

    if (!this.policy.capture_when_idle && idleSeconds >= IDLE_THRESHOLD_SECONDS) {
      this.skippedCount += 1;
      this.emit('status', this.getStatus());
      return { captured: false, reason: 'idle' };
    }

    const appName = activeAppWatcher.getCurrentApp() || 'Desktop';
    const windowTitle = activeAppWatcher.getCurrentTitle() || '';

    if (this.isBlockedWindow(appName, windowTitle)) {
      this.skippedCount += 1;
      this.emit('status', this.getStatus());
      return { captured: false, reason: 'privacy_blocked' };
    }

    this.capturing = true;
    try {
      const image = await this.grabScreen();
      const signature = this.dHash(image);

      if (
        signature &&
        this.lastSignature &&
        this.hamming(signature, this.lastSignature) <= (Number(this.policy.dedupe_distance) || 5)
      ) {
        this.duplicateCount += 1;
        this.lastCaptureAt = new Date();
        this.emit('status', this.getStatus());
        return { captured: false, reason: 'duplicate_frame', signature };
      }

      const { buffer, quality } = this.compressToLimit(image, this.policy.max_upload_bytes);

      const result = await this.apiService.uploadScreenshot({
        image: buffer.toString('base64'),
        signature,
        capturedAt: new Date().toISOString(),
        activeApp: appName,
        windowTitle,
        sessionId: this.attendanceId,
        trigger: trigger || 'scheduled',
        intervalSeconds: Math.round((Number(this.policy.interval_minutes) || 15) * 60),
        quality,
        taskId: this.activeTaskId || null
      });

      if (result && result.success) {
        this.lastSignature = signature;
        this.lastCaptureAt = new Date();
        this.consecutiveFailures = 0;
        this.lastError = null;

        if (result.stored) {
          this.uploadCount += 1;
        } else if (result.skipped === 'duplicate_frame') {
          this.duplicateCount += 1;
        } else {
          this.skippedCount += 1;
        }

        this.emit('status', this.getStatus());
        return { captured: !!result.stored, reason: result.skipped || null, signature };
      }

      this.failureCount += 1;
      this.consecutiveFailures += 1;
      this.lastError = (result && result.error) || 'Upload rejected';
      this.emit('status', this.getStatus());
      return { captured: false, reason: 'upload_rejected', error: this.lastError };
    } catch (error) {
      this.failureCount += 1;
      this.consecutiveFailures += 1;
      this.lastError = error.message;
      this.emit('status', this.getStatus());
      console.warn('📸 Capture failed:', error.message);
      return { captured: false, reason: 'error', error: error.message };
    } finally {
      this.capturing = false;
    }
  }

  getStatus() {
    return {
      running: this.isRunning,
      mode: this.policy.mode,
      periodic_enabled: this.policy.periodic_enabled,
      interval_minutes: this.policy.interval_minutes,
      started_at: this.startedAt,
      last_capture_at: this.lastCaptureAt,
      next_capture_at: this.nextCaptureAt,
      uploads: this.uploadCount,
      duplicates: this.duplicateCount,
      skipped: this.skippedCount,
      failures: this.failureCount,
      consecutive_failures: this.consecutiveFailures,
      last_error: this.lastError,
      active_task_id: this.activeTaskId
    };
  }
}

module.exports = ScreenshotEngine;
