/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Native Windows Application & State Monitor
 *
 * PRIVACY GUARANTEES:
 * 1. Resolves foreground executable/process name ONLY (e.g. Code.exe -> Visual Studio Code).
 * 2. STRICTLY PROHIBITS window titles, document names, browser URLs, tab titles, or file paths.
 * 3. Measures foreground application usage duration without double-counting.
 * 4. Tracks hardware idle (GetLastInputInfo) and workstation lock states.
 * 5. Aggregates metrics locally in discrete windows before transmission.
 */

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import EventEmitter from 'node:events';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper binary path in employee-agent-v2/bin/
const HELPER_BIN_PATH = path.resolve(__dirname, '../../bin/NiyantranWin32Helper.exe');

export class Win32Monitor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.helperPath = options.helperPath || HELPER_BIN_PATH;
    this.idleThresholdMs = options.idleThresholdMs || 300 * 1000; // 5 minutes default
    this.sampleIntervalMs = options.sampleIntervalMs || 1000;

    // Tracking state
    this.isMonitoring = false;
    this.isPaused = false;
    this.childProcess = null;

    // Accumulators for current telemetry window
    this.appDurations = new Map(); // appName -> duration in seconds
    this.idleSeconds = 0;
    this.lockSeconds = 0;
    this.totalActiveSeconds = 0;

    // Current instant tracking
    this.currentForegroundApp = null;
    this.lastSampleTimestamp = null;
  }

  isAvailable() {
    return process.platform === 'win32' && fs.existsSync(this.helperPath);
  }

  /**
   * Performs a single synchronous or asynchronous point-in-time sample.
   *
   * @returns {Promise<{
   *   success: boolean,
   *   exeName: string,
   *   appName: string,
   *   pid: number,
   *   idleMs: number,
   *   isLocked: boolean,
   *   isIdle: boolean,
   *   timestamp: string
   * }>}
   */
  async sample() {
    if (!this.isAvailable()) {
      // Fallback for non-Windows (CI sandbox) or missing binary
      return {
        success: true,
        exeName: 'node.exe',
        appName: 'Node.js Runtime',
        pid: process.pid,
        idleMs: 0,
        isLocked: false,
        isIdle: false,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const { stdout } = await execFileAsync(this.helperPath, ['sample'], { timeout: 2500 });
      const data = JSON.parse(stdout.trim());
      data.isIdle = data.idleMs >= this.idleThresholdMs;
      return data;
    } catch (err) {
      return {
        success: false,
        exeName: 'Unknown',
        appName: 'Unknown',
        pid: 0,
        idleMs: 0,
        isLocked: false,
        isIdle: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Starts real-time stream sampling.
   */
  startMonitoring() {
    if (this.isMonitoring) return;
    this.isMonitoring = true;
    this.isPaused = false;
    this.resetWindowMetrics();

    if (!this.isAvailable()) {
      // CI / Mock interval loop for non-Windows
      this._mockTimer = setInterval(async () => {
        if (!this.isMonitoring || this.isPaused) return;
        const s = await this.sample();
        this.processSample(s);
      }, this.sampleIntervalMs);
      return;
    }

    // Spawn stream mode of native Win32 helper
    this.childProcess = spawn(this.helperPath, ['stream', String(this.sampleIntervalMs)], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let buffer = '';
    this.childProcess.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep partial line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const sampleData = JSON.parse(trimmed);
          sampleData.isIdle = sampleData.idleMs >= this.idleThresholdMs;
          this.processSample(sampleData);
        } catch (_) {
          // Ignore parse errors on partial streams
        }
      }
    });

    this.childProcess.stderr.on('data', (err) => {
      this.emit('error', err.toString());
    });

    this.childProcess.on('exit', () => {
      this.childProcess = null;
      if (this.isMonitoring) {
        // Attempt restart if closed unexpectedly while active
        this.emit('stream_restarting');
      }
    });
  }

  /**
   * Processes each 1-second sample and credits time buckets without double-counting.
   */
  processSample(sample) {
    if (!this.isMonitoring || this.isPaused) return;

    const now = Date.now();
    const deltaSeconds = typeof sample.durationSeconds === 'number'
      ? sample.durationSeconds
      : (this.lastSampleTimestamp ? Math.max(1, Math.min(Math.round((now - this.lastSampleTimestamp) / 1000), 5)) : 1);
    this.lastSampleTimestamp = now;

    if (sample.isLocked) {
      this.lockSeconds += deltaSeconds;
      this.currentForegroundApp = '[Workstation Locked]';
    } else if (sample.isIdle) {
      this.idleSeconds += deltaSeconds;
      this.currentForegroundApp = '[System Idle]';
    } else {
      // Active application in foreground
      const app = sample.appName || sample.exeName || 'Unknown';
      this.currentForegroundApp = app;
      const currentVal = this.appDurations.get(app) || 0;
      this.appDurations.set(app, currentVal + deltaSeconds);
      this.totalActiveSeconds += deltaSeconds;
    }

    this.emit('sample', {
      currentApp: this.currentForegroundApp,
      isIdle: sample.isIdle,
      isLocked: sample.isLocked,
      pid: sample.pid,
      timestamp: sample.timestamp,
    });
  }

  pauseMonitoring() {
    this.isPaused = true;
    this.currentForegroundApp = null;
    this.lastSampleTimestamp = null;
  }

  resumeMonitoring() {
    this.isPaused = false;
    this.lastSampleTimestamp = Date.now();
  }

  stopMonitoring() {
    this.isMonitoring = false;
    this.isPaused = false;
    this.currentForegroundApp = null;
    this.lastSampleTimestamp = null;

    if (this._mockTimer) {
      clearInterval(this._mockTimer);
      this._mockTimer = null;
    }

    if (this.childProcess) {
      try {
        this.childProcess.kill();
      } catch (_) {}
      this.childProcess = null;
    }
  }

  resetWindowMetrics() {
    this.appDurations.clear();
    this.idleSeconds = 0;
    this.lockSeconds = 0;
    this.totalActiveSeconds = 0;
    this.lastSampleTimestamp = Date.now();
  }

  /**
   * Flushes and resets metrics accumulated in the window.
   *
   * @param {number} windowDurationSeconds
   * @returns {{
   *   apps: Array<{ name: string, durationSeconds: number }>,
   *   idleSeconds: number,
   *   lockSeconds: number,
   *   totalActiveSeconds: number,
   *   windowDurationSeconds: number
   * }}
   */
  flushWindowMetrics(windowDurationSeconds = 60) {
    const apps = [];
    for (const [name, durationSeconds] of this.appDurations.entries()) {
      if (durationSeconds > 0) {
        apps.push({ name, durationSeconds });
      }
    }

    // Sort apps by duration descending
    apps.sort((a, b) => b.durationSeconds - a.durationSeconds);

    const metrics = {
      apps,
      idleSeconds: this.idleSeconds,
      lockSeconds: this.lockSeconds,
      totalActiveSeconds: this.totalActiveSeconds,
      windowDurationSeconds,
    };

    this.resetWindowMetrics();
    return metrics;
  }
}

export default Win32Monitor;
