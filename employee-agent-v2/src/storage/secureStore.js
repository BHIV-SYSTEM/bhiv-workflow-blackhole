/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Desktop Agent Secure Store
 *
 * Implements Phase C Windows DPAPI Encrypted Storage:
 * - Uses Windows Data Protection API (DPAPI) via native Win32 helper.
 * - CurrentUser scope: Credentials cannot be decrypted by other user accounts or machines.
 * - ZERO plaintext storage of session tokens or private device keys.
 * - Persisted safely to %LOCALAPPDATA%\NiyantranMonitoringV2\secure_credentials.enc.
 * - Graceful in-memory fallback for non-Windows (CI sandbox).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HELPER_BIN_PATH = path.resolve(__dirname, '../../bin/NiyantranWin32Helper.exe');

export class WindowsDPAPIAdapter {
  constructor(options = {}) {
    this.helperPath = options.helperPath || HELPER_BIN_PATH;
    
    // Default storage directory: %LOCALAPPDATA%\NiyantranMonitoringV2
    const baseDir = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '.', 'AppData', 'Local');
    this.storageDir = options.storageDir || path.join(baseDir, 'NiyantranMonitoringV2');
    this.storageFile = path.join(this.storageDir, 'secure_credentials.enc');

    this._ensureStorageDir();
  }

  _ensureStorageDir() {
    if (!fs.existsSync(this.storageDir)) {
      try {
        fs.mkdirSync(this.storageDir, { recursive: true });
      } catch (_) {}
    }
  }

  isAvailable() {
    return process.platform === 'win32' && fs.existsSync(this.helperPath);
  }

  _readEncryptedStore() {
    try {
      if (!fs.existsSync(this.storageFile)) return {};
      const raw = fs.readFileSync(this.storageFile, 'utf8');
      return JSON.parse(raw);
    } catch (_) {
      return {};
    }
  }

  _writeEncryptedStore(store) {
    this._ensureStorageDir();
    fs.writeFileSync(this.storageFile, JSON.stringify(store, null, 2), 'utf8');
  }

  async get(key) {
    if (!this.isAvailable()) return null;
    const store = this._readEncryptedStore();
    const cipher = store[key];
    if (!cipher) return null;

    try {
      const { stdout } = await execFileAsync(this.helperPath, ['dpapi-unprotect', cipher], { timeout: 3000 });
      return stdout.trim();
    } catch (err) {
      console.error(`[SecureStore] DPAPI decrypt failed for key "${key}":`, err.message);
      return null;
    }
  }

  async set(key, value) {
    if (!this.isAvailable()) {
      throw new Error('Windows DPAPI subsystem unavailable');
    }

    try {
      const { stdout } = await execFileAsync(this.helperPath, ['dpapi-protect', String(value)], { timeout: 3000 });
      const cipher = stdout.trim();
      const store = this._readEncryptedStore();
      store[key] = cipher;
      this._writeEncryptedStore(store);
      return true;
    } catch (err) {
      console.error(`[SecureStore] DPAPI encrypt failed for key "${key}":`, err.message);
      throw err;
    }
  }

  async delete(key) {
    const store = this._readEncryptedStore();
    if (key in store) {
      delete store[key];
      this._writeEncryptedStore(store);
      return true;
    }
    return false;
  }

  async clear() {
    this._writeEncryptedStore({});
    return true;
  }
}

export class InMemorySecureStoreFallback {
  constructor() {
    this._store = new Map();
  }

  async get(key) {
    return this._store.get(key) || null;
  }

  async set(key, value) {
    this._store.set(key, String(value));
    return true;
  }

  async delete(key) {
    return this._store.delete(key);
  }

  async clear() {
    this._store.clear();
    return true;
  }
}

export class SecureStore {
  constructor(adapter = null) {
    if (adapter) {
      this.adapter = adapter;
    } else if (process.platform === 'win32' && fs.existsSync(HELPER_BIN_PATH)) {
      this.adapter = new WindowsDPAPIAdapter();
    } else {
      this.adapter = new InMemorySecureStoreFallback();
    }
  }

  async getSecret(key) {
    return this.adapter.get(key);
  }

  async setSecret(key, value) {
    if (!key || typeof key !== 'string') {
      throw new Error('Secret key must be a non-empty string');
    }
    return this.adapter.set(key, value);
  }

  async deleteSecret(key) {
    return this.adapter.delete(key);
  }

  async clearAll() {
    return this.adapter.clear();
  }
}

export default SecureStore;
