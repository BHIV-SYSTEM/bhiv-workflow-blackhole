/**
 * Tier 1 Feature Coverage: F1 — Desktop Agent Installer & SHA-256 Verification
 * Verifies installer metadata API, binary PE download, SHA-256 integrity,
 * zip package distribution, and dashboard download contract.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');

const { config, authHelper, WindowsHelper, apiRequest } = require('./tier1Common');

test('[F1] Installer Info Endpoint Returns Version & SHA-256', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: '/api/monitoring-v2/installer/info'
  });

  assert.equal(res.status, 200, 'Installer info endpoint must return HTTP 200');
  assert.ok(res.body, 'Response body must not be empty');
  assert.equal(res.body.success, true, 'Response must indicate success');
  assert.equal(res.body.available, true, 'Installer must be marked available');
  assert.equal(res.body.version, '2.0.0', 'Installer version must be 2.0.0');
  assert.equal(res.body.fileName, config.installer.fileName, 'File name must match expected installer');
  assert.equal(
    res.body.sha256.toUpperCase(),
    config.installer.sha256.toUpperCase(),
    'SHA-256 hash must match authoritative expected value'
  );
  assert.equal(res.body.sizeBytes, config.installer.sizeBytes, 'Size in bytes must match expected size');
  assert.equal(res.body.platform, 'win32-x64', 'Platform must be win32-x64');
});

test('[F1] Portable Executable Binary Download Verification', async () => {
  const token = authHelper.createUserToken();

  const res = await apiRequest({
    method: 'GET',
    path: '/api/monitoring-v2/installer/download',
    query: { format: 'exe' },
    token
  });

  assert.equal(res.status, 200, 'Authenticated download must return HTTP 200');
  const contentType = res.headers['content-type'] || '';
  assert.ok(
    contentType.includes('application/vnd.microsoft.portable-executable') ||
    contentType.includes('application/octet-stream'),
    `Content-Type must indicate PE binary executable, got: ${contentType}`
  );

  const contentDisp = res.headers['content-disposition'] || '';
  assert.ok(
    contentDisp.includes(config.installer.fileName),
    `Content-Disposition header must specify ${config.installer.fileName}`
  );

  // Validate PE header ('MZ')
  const binaryBuffer = fs.readFileSync(config.installer.localPath);
  assert.equal(binaryBuffer[0], 0x4D, 'First byte must be 0x4D ("M")');
  assert.equal(binaryBuffer[1], 0x5A, 'Second byte must be 0x5A ("Z")');
});

test('[F1] Cryptographic SHA-256 Hash Matching Authoritative Spec', () => {
  const verifyResult = WindowsHelper.verifyInstallerBinary();

  assert.ok(verifyResult.exists, 'Installer binary must exist on local filesystem');
  assert.ok(verifyResult.hasPeHeader, 'Installer binary must have valid PE header');
  assert.equal(verifyResult.sizeBytes, config.installer.sizeBytes, 'File size must equal 55808 bytes');
  assert.equal(
    verifyResult.sha256,
    config.installer.sha256,
    'Computed file SHA-256 must strictly match authoritative hash'
  );
  assert.ok(verifyResult.valid, 'Installer binary verification must evaluate to true');

  // Double check direct Node crypto computation
  const fileBytes = fs.readFileSync(config.installer.localPath);
  const hash = crypto.createHash('sha256').update(fileBytes).digest('hex').toUpperCase();
  assert.equal(hash, config.installer.sha256, 'Direct crypto SHA-256 must match config');
});

test('[F1] Installer ZIP Archive Package Download Verification', async () => {
  const token = authHelper.createUserToken();

  const res = await apiRequest({
    method: 'GET',
    path: '/api/monitoring-v2/installer/download',
    query: { format: 'zip' },
    token
  });

  assert.equal(res.status, 200, 'ZIP download must return HTTP 200');
  const contentType = res.headers['content-type'] || '';
  assert.ok(
    contentType.includes('application/zip') || contentType.includes('application/octet-stream'),
    `Content-Type must indicate ZIP archive, got: ${contentType}`
  );

  const contentDisp = res.headers['content-disposition'] || '';
  assert.ok(
    contentDisp.toLowerCase().includes('.zip'),
    `Content-Disposition must reference ZIP archive, got: ${contentDisp}`
  );

  // Validate ZIP magic bytes 'PK\x03\x04'
  const zipPath = config.installer.localPath.replace(/NiyantranMonitoringAgentV2-Setup\.exe$/, 'Niyantran-Agent-V2-Setup.zip');
  if (fs.existsSync(zipPath)) {
    const zipBytes = fs.readFileSync(zipPath);
    assert.equal(zipBytes[0], 0x50, 'ZIP byte 0 must be 0x50 (P)');
    assert.equal(zipBytes[1], 0x4B, 'ZIP byte 1 must be 0x4B (K)');
    assert.equal(zipBytes[2], 0x03, 'ZIP byte 2 must be 0x03');
    assert.equal(zipBytes[3], 0x04, 'ZIP byte 3 must be 0x04');
  }
});

test('[F1] Dashboard Installer Metadata & Download Contract', async () => {
  const res = await apiRequest({
    method: 'GET',
    path: '/api/monitoring-v2/installer/info'
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.supportsSilentInstall, true, 'Installer must declare silent install support');
  assert.equal(res.body.silentArgs, '/S', 'Silent install arguments must be /S');
  assert.equal(res.body.downloadUrl, '/api/monitoring-v2/installer/download', 'Download URL must point to endpoint');
  assert.ok(Array.isArray(res.body.instructions), 'Instructions must be an array');
  assert.ok(res.body.instructions.length >= 3, 'Must contain at least 3 installation steps');
  assert.ok(
    res.body.instructions.some((step) => step.toLowerCase().includes('enrollment code') || step.toLowerCase().includes('dashboard')),
    'Instructions must explain enrollment code pairing'
  );
});
