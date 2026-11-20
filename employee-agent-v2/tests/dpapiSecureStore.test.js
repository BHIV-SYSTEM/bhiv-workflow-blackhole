/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Windows DPAPI Secure Store Tests
 *
 * Verifies real OS-backed DPAPI encryption and disk persistence.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WindowsDPAPIAdapter, SecureStore } from '../src/storage/secureStore.js';

test('WindowsDPAPIAdapter: encrypts with real DPAPI and persists non-plaintext ciphertext to disk', async (t) => {
  if (process.platform !== 'win32') {
    if (t && typeof t.skip === 'function') t.skip('Windows DPAPI requires win32 OS environment');
    return;
  }
  const tempDir = path.join(os.tmpdir(), `niyantran_dpapi_test_${Date.now()}`);
  const adapter = new WindowsDPAPIAdapter({ storageDir: tempDir });

  const secretKey = 'device_private_hmac_secret_key';
  const secretValue = 'sec_jwt_auth_token_9876543210_valid';

  // 1. Set secret via DPAPI
  await adapter.set(secretKey, secretValue);

  // 2. Inspect the physical file on disk directly
  const rawFile = fs.readFileSync(adapter.storageFile, 'utf8');
  const storedJson = JSON.parse(rawFile);

  // Invariant: The raw disk content MUST NOT contain the plaintext secret
  assert.equal(rawFile.includes(secretValue), false, 'Plaintext secret must NEVER be visible on disk');

  // Invariant: Value must be standard Windows DPAPI Base64 blob starting with AQAAANCMnd8...
  const cipher = storedJson[secretKey];
  assert.ok(cipher, 'Ciphertext must exist in storage file');
  assert.ok(cipher.startsWith('AQAAANCMnd8'), 'Must be a valid Windows DPAPI ciphertext header');

  // 3. Decrypt via DPAPI
  const decrypted = await adapter.get(secretKey);
  assert.equal(decrypted, secretValue, 'Decrypted value must exactly match original secret');

  // 4. Delete secret
  const deleted = await adapter.delete(secretKey);
  assert.equal(deleted, true);
  const afterDelete = await adapter.get(secretKey);
  assert.equal(afterDelete, null);

  // Clean up test directory
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}
});

test('SecureStore: factory instantiates WindowsDPAPIAdapter on Windows platform', () => {
  const store = new SecureStore();
  if (process.platform === 'win32') {
    assert.ok(store.adapter instanceof WindowsDPAPIAdapter, 'Should default to WindowsDPAPIAdapter on Windows');
  }
});
