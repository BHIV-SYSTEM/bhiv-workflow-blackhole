/**
 * TRINETRA Screenshot Engine (Electron main process)
 *
 * PRIVACY OVERRIDE — SCREENSHOTS ARE PERMANENTLY DISABLED.
 * Screen capture (periodic, manual and per-window) never runs: the flag
 * below short-circuits start()/captureOnce() before desktopCapturer is
 * ever touched, so no frame can leave this machine. Activity duration
 * monitoring ("Second Eye": who is doing what, for how long) keeps
 * running through the activity tracker and is unaffected.
 *
 * Original design (retained for reference):
 *  - Periodic, low-impact screen capture with client-side deduplication.
 *  - Uses Electron's built-in `desktopCapturer` (no new native dependency).
 *  - Computes a 64-bit dHash from the captured frame and skips the upload
 *    when the screen is perceptually unchanged.
 *  - Never captures while the workday is closed, while monitoring is
 *    paused, while the user is idle (unless policy allows it), or when
 *    the focused window matches a blocked title pattern.
 *  - Polls policy from the backend so cadence/mode/masking is managed
 *    centrally.
 */

const { EventEmitter } = require('events');
const { desktopCapturer, powerMonitor } = require('electron');
const activeAppWatcher = require('../utils/activeAppWatcher');

// ── Privacy master switch ────────────────────────────────────────────────────
// Flip to true ONLY if screenshots are ever deliberately re-enabled.
const SCREENSHOTS_DISABLED = true;

const DEFAULT_POLICY = {
  periodic_enabled: false,
  mode: 'intelligent',
  interval_minutes: 15,
  jitter_minutes: 5,
  dedupe_distance: 5,
  max_per_hour: 8,
  capture_when_idle: false,
  capture_windows: false,
  max_windows_per_capture: 5,
  jpeg_quality: 70,
  max_upload_bytes: 512000,
  blocked_title_patterns: []
};

const POLICY_REFRESH_MS = 5 * 60 * 1000;
const IDLE_THRESHOLD_SECONDS = 120;
// Thumbnails below this width are broken captures (64×64/100×100 red or
// blank frames seen when the capture session is denied/headless) — they
// would only pollute the admin gallery, so they are never uploaded.
const MIN_USABLE_THUMB_PX = 320;

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
    this.lastSignatures = new Map();
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
    if (SCREENSHOTS_DISABLED) {
      // Privacy override: never arm a capture timer, never fetch policy,
      // never touch desktopCapturer.
      this.isRunning = false;
      this.attendanceId = attendanceId || null;
      console.log('🚫 Screenshot capture disabled by privacy policy (no screen capture)');
      this.emit('status', this.getStatus());
      return;
    }

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

      const prevPeriodic = !!this.policy.periodic_enabled;
      const prevInterval = Number(this.policy.interval_minutes) || 15;
      const prevJitter = Number(this.policy.jitter_minutes) || 0;

      if (config.capture) {
        this.policy = { ...DEFAULT_POLICY, ...config.capture };
      }

      const nextPeriodic = !!this.policy.periodic_enabled;
      const nextInterval = Number(this.policy.interval_minutes) || 15;
      const nextJitter = Number(this.policy.jitter_minutes) || 0;

      // Re-arm ONLY when capture enablement or cadence actually changed;
      // otherwise the 5-min policy poll would continuously cancel the 10-15 min
      // capture timeout before it could ever fire.
      if (this.isRunning) {
        if (!nextPeriodic && this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
          this.nextCaptureAt = null;
        } else if (
          nextPeriodic &&
          (!this.timer || !prevPeriodic || prevInterval !== nextInterval || prevJitter !== nextJitter)
        ) {
          if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
          }
          this.scheduleNext({ initial: !prevPeriodic });
        }
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
    let working = image;
    let buffer = working.toJPEG(quality);

    while (buffer.length > limit && quality > 30) {
      quality -= 10;
      buffer = working.toJPEG(quality);
    }

    // Step down resolution on ultra-high-DPI / 4K screens so uploads stay under max_upload_bytes
    for (const targetWidth of [1280, 960]) {
      if (buffer.length <= limit) break;
      const size = working.getSize();
      if (size && size.width > targetWidth) {
        working = working.resize({ width: targetWidth, quality: 'good' });
        buffer = working.toJPEG(Math.max(30, quality));
      }
    }

    return { buffer, quality };
  }

  async grabScreens() {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1600, height: 1000 },
      fetchWindowIcons: false
    });

    if (!sources || sources.length === 0) {
      throw new Error('No screen sources available (permission or headless session)');
    }

    const screens = [];
    sources.forEach((source, index) => {
      const image = source && source.thumbnail;
      if (image && !image.isEmpty()) {
        const { width } = image.getSize();
        if (width < MIN_USABLE_THUMB_PX) return; // broken/tiny capture
        screens.push({
          index,
          label: (source.name || `Display ${index + 1}`),
          sourceId: source.id,
          image
        });
      }
    });

    if (screens.length === 0) {
      throw new Error(
        'Empty or unusable capture thumbnails (screen recording permission may be denied)'
      );
    }

    return screens;
  }

  async grabWindows(maxWindows) {
    const limit = Math.max(1, Number(maxWindows) || 5);
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 1280, height: 800 },
      fetchWindowIcons: false
    });

    if (!sources || sources.length === 0) return [];

    const windows = [];
    for (const source of sources) {
      if (windows.length >= limit) break;
      const image = source && source.thumbnail;
      if (!image || image.isEmpty()) continue;
      const { width } = image.getSize();
      if (width < MIN_USABLE_THUMB_PX) continue; // broken/tiny capture
      const title = source.name || '';
      // Skip empty/hidden/system windows
      if (!title.trim()) continue;
      windows.push({
        index: windows.length,
        label: title,
        sourceId: source.id,
        image,
        appName: title.split(' - ').pop() || title
      });
    }
    return windows;
  }

  async captureOnce(trigger = 'scheduled') {
    if (SCREENSHOTS_DISABLED) {
      return { captured: false, reason: 'screenshots_disabled' };
    }
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
      const screens = await this.grabScreens();
      const results = [];
      let anyStored = false;

      for (const screen of screens) {
        const signature = this.dHash(screen.image);
        const previousSignature = this.lastSignatures.get(screen.index) || null;

        if (
          signature &&
          previousSignature &&
          this.hamming(signature, previousSignature) <= (Number(this.policy.dedupe_distance) || 5)
        ) {
          this.duplicateCount += 1;
          results.push({ monitor: screen.index, captured: false, reason: 'duplicate_frame', signature });
          continue;
        }

        const { buffer, quality } = this.compressToLimit(screen.image, this.policy.max_upload_bytes);

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
          taskId: this.activeTaskId || null,
          monitorIndex: screen.index,
          monitorLabel: screen.label,
          captureScope: 'screen'
        });

        if (result && result.success) {
          if (signature) this.lastSignatures.set(screen.index, signature);
          this.lastCaptureAt = new Date();
          this.consecutiveFailures = 0;
          this.lastError = null;

          if (result.stored) {
            this.uploadCount += 1;
            anyStored = true;
          } else if (result.skipped === 'duplicate_frame') {
            this.duplicateCount += 1;
          } else {
            this.skippedCount += 1;
          }
          results.push({ monitor: screen.index, captured: !!result.stored, reason: result.skipped || null, signature });
        } else {
          this.failureCount += 1;
          this.consecutiveFailures += 1;
          this.lastError = (result && result.error) || 'Upload rejected';
          results.push({ monitor: screen.index, captured: false, reason: 'upload_rejected', error: this.lastError });
        }
      }

      // Optional per-window capture for deeper OS context (admin-controlled).
      if (this.policy.capture_windows) {
        try {
          const windows = await this.grabWindows(this.policy.max_windows_per_capture);
          for (const win of windows) {
            const signature = this.dHash(win.image);
            const { buffer, quality } = this.compressToLimit(win.image, this.policy.max_upload_bytes);
            const result = await this.apiService.uploadScreenshot({
              image: buffer.toString('base64'),
              signature,
              capturedAt: new Date().toISOString(),
              activeApp: win.appName,
              windowTitle: win.label,
              sessionId: this.attendanceId,
              trigger: trigger || 'scheduled',
              intervalSeconds: Math.round((Number(this.policy.interval_minutes) || 15) * 60),
              quality,
              taskId: this.activeTaskId || null,
              monitorIndex: 1000 + win.index,
              monitorLabel: win.label,
              captureScope: 'window'
            });
            if (result && result.success) {
              if (result.stored) {
                this.uploadCount += 1;
                anyStored = true;
              } else if (result.skipped === 'duplicate_frame') {
                this.duplicateCount += 1;
              } else {
                this.skippedCount += 1;
              }
            } else {
              this.skippedCount += 1;
            }
          }
        } catch (windowErr) {
          console.warn('Window capture failed:', windowErr.message);
        }
      }

      this.emit('status', this.getStatus());
      return { captured: anyStored, reason: anyStored ? null : 'no_capture', results };
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
      disabled: SCREENSHOTS_DISABLED,
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
