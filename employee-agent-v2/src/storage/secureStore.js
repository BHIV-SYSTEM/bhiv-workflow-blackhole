/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Desktop Agent Secure Store Contract (Phase A Scaffolding)
 *
 * Replaces V1 plaintext storage with an encrypted credential storage interface.
 * Plaintext passwords and tokens must never be written to unencrypted JSON files.
 */

export class SecureStore {
  constructor(adapter = null) {
    this.adapter = adapter || new InMemorySecureStoreFallback();
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

class InMemorySecureStoreFallback {
  constructor() {
    this._store = new Map();
  }

  async get(key) {
    return this._store.get(key) || null;
  }

  async set(key, value) {
    this._store.set(key, value);
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

export default SecureStore;
