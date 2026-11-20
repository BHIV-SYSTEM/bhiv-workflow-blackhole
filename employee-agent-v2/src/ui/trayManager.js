/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Native System Tray Manager
 *
 * Implements Phase C Visible Desktop Interface:
 * 1. Spawns and communicates with native Windows NotifyIcon tray helper.
 * 2. Visual indication of monitoring states (Active, Paused, Conflict, Stopped).
 * 3. Employee interactive controls: Start, Pause, Resume, End session.
 * 4. Transparent Privacy Notice popup.
 * 5. Device identity & pairing status display.
 * 6. Graceful headless fallback for testing.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import EventEmitter from 'node:events';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HELPER_BIN_PATH = path.resolve(__dirname, '../../bin/NiyantranWin32Helper.exe');

export class TrayManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.helperPath = options.helperPath || HELPER_BIN_PATH;
    this.deviceId = options.deviceId || 'DEV-UNPAIRED';
    this.sessionStatus = 'WAITING_AUTH';
    this.childProcess = null;
    this.isTrayReady = false;
  }

  isAvailable() {
    return process.platform === 'win32' && fs.existsSync(this.helperPath);
  }

  /**
   * Spawns the native Windows system tray process.
   */
  start() {
    if (!this.isAvailable()) {
      this.isTrayReady = true;
      this.emit('ready', { mode: 'headless_mock' });
      return;
    }

    try {
      this.childProcess = spawn(this.helperPath, ['tray', this.deviceId], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (this.childProcess.stdin) {
        this.childProcess.stdin.on('error', () => {});
      }

      let buffer = '';
      this.childProcess.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const msg = JSON.parse(trimmed);
            if (msg.event === 'TRAY_READY') {
              this.isTrayReady = true;
              this.emit('ready', { mode: 'native_win32' });
            } else if (msg.event === 'TRAY_ACTION') {
              this.emit('action', msg.action);
            }
          } catch (_) {}
        }
      });

      this.childProcess.on('exit', () => {
        this.isTrayReady = false;
        this.childProcess = null;
        this.emit('exit');
      });
    } catch (err) {
      this.emit('error', err);
    }
  }

  updateStatus(newStatus) {
    this.sessionStatus = newStatus;
    if (this.childProcess && this.childProcess.stdin && !this.childProcess.stdin.destroyed && this.childProcess.stdin.writable) {
      try {
        this.childProcess.stdin.write(JSON.stringify({ cmd: 'UPDATE_STATUS', status: newStatus }) + '\n');
      } catch (_) {}
    }
    this.emit('status_updated', newStatus);
  }

  stop() {
    if (this.childProcess) {
      try {
        this.childProcess.stdin.write(JSON.stringify({ cmd: 'QUIT' }) + '\n');
        this.childProcess.kill();
      } catch (_) {}
      this.childProcess = null;
    }
    this.isTrayReady = false;
  }
}

export default TrayManager;
