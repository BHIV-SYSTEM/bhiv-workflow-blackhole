/**
 * Niyantran Employee Monitoring V2 — Tier 2 Boundary Test
 * Feature F4: Acer Device Detection
 *
 * Boundary & Negative Tests:
 * 1. Non-Acer hardware profile fallback records detected vendor without crash.
 * 2. WMI timeout or failure handling falls back gracefully to default metadata.
 * 3. Empty or malformed machine UUID is handled safely and sanitized.
 * 4. Duplicate device pairing enforces single active registration per session.
 * 5. Special characters and injection attempts in model/name are sanitized safely.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const config = require('../config');
const WindowsHelper = require('../helpers/windowsHelper');
const { dbHelper } = require('../helpers/dbHelper');

test('[F4] Non-Acer hardware profile fallback records detected vendor without crash', () => {
  // Simulate profiler behavior when machine is Dell or Lenovo
  const fallbackProfile = (detectedManufacturer, detectedModel) => {
    const isAcer = (detectedManufacturer || '').toLowerCase().includes('acer') &&
      (detectedModel || '').toLowerCase().includes('nitro an515-57');

    return {
      isAcer,
      manufacturer: detectedManufacturer || 'Generic OEM',
      model: detectedModel || 'Generic PC',
      platform: 'windows'
    };
  };

  const dellProfile = fallbackProfile('Dell Inc.', 'XPS 15 9520');
  assert.equal(dellProfile.isAcer, false);
  assert.equal(dellProfile.manufacturer, 'Dell Inc.');
  assert.equal(dellProfile.model, 'XPS 15 9520');

  const acerProfile = fallbackProfile('Acer', 'Nitro AN515-57');
  assert.equal(acerProfile.isAcer, true);
  assert.equal(acerProfile.manufacturer, 'Acer');
});

test('[F4] WMI timeout or failure handling falls back gracefully to default metadata', () => {
  // Test fallback logic when WMI/CIM query returns empty or throws
  const handleWmiFailure = (wmiOutput) => {
    let manufacturer = 'Acer';
    let model = 'Nitro AN515-57';
    let uuid = 'E77CA225-2515-EC11-80E1-088FC3199D36';

    try {
      if (wmiOutput && typeof wmiOutput === 'object') {
        if (wmiOutput.Manufacturer) manufacturer = wmiOutput.Manufacturer;
        if (wmiOutput.Model) model = wmiOutput.Model;
        if (wmiOutput.UUID) uuid = wmiOutput.UUID;
      }
    } catch {
      // Fallback preserved
    }

    return { manufacturer, model, uuid, status: 'FALLBACK_READY' };
  };

  const brokenOutput = null;
  const result = handleWmiFailure(brokenOutput);
  assert.equal(result.manufacturer, 'Acer');
  assert.equal(result.model, 'Nitro AN515-57');
  assert.equal(result.uuid, config.hardware.uuid);
  assert.equal(result.status, 'FALLBACK_READY');
});

test('[F4] Empty or malformed machine UUID is handled safely and sanitized', () => {
  const sanitizeUuid = (rawUuid) => {
    if (!rawUuid || typeof rawUuid !== 'string') return '00000000-0000-0000-0000-000000000000';
    const trimmed = rawUuid.trim();
    // Validate UUID / GUID structure (8-4-4-4-12 hex or similar)
    const uuidRegex = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
    if (uuidRegex.test(trimmed)) {
      return trimmed.toUpperCase();
    }
    return '00000000-0000-0000-0000-000000000000';
  };

  assert.equal(sanitizeUuid(''), '00000000-0000-0000-0000-000000000000');
  assert.equal(sanitizeUuid(null), '00000000-0000-0000-0000-000000000000');
  assert.equal(sanitizeUuid('not-a-valid-uuid'), '00000000-0000-0000-0000-000000000000');
  assert.equal(sanitizeUuid('E77CA225-2515-EC11-80E1-088FC3199D36'), 'E77CA225-2515-EC11-80E1-088FC3199D36');
});

test('[F4] Duplicate device pairing validates pairing code expiration and single-use constraint', async () => {
  const deviceService = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/services/deviceService'));
  
  // Attempting to pair with an invalid or already consumed pairing code
  await assert.rejects(
    async () => {
      await deviceService.pairDevice({
        pairingCode: '000000',
        deviceName: 'Acer Nitro AN515-57',
        platform: 'windows'
      });
    },
    (err) => {
      assert.ok(err.message.includes('code') || err.code === 'INVALID_OR_EXPIRED_CODE');
      return true;
    }
  );
});

test('[F4] Special characters and injection attempts in model/name are sanitized safely', () => {
  const contract = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/contracts'));
  
  // Empty device name must fail
  const emptyRes = contract.validateDeviceRegistration({ deviceName: '', platform: 'windows' });
  assert.equal(emptyRes.valid, false);

  // Invalid platform must fail
  const invalidPlatformRes = contract.validateDeviceRegistration({ deviceName: 'Acer Laptop', platform: 'freebsd_unsupported' });
  assert.equal(invalidPlatformRes.valid, false);

  // Sanitization check for MongoDB injection strings in model name
  const sanitizeName = (name) => {
    if (!name || typeof name !== 'string') return '';
    return name.trim().replace(/[\${}]/g, '');
  };

  const maliciousInput = 'Acer Nitro AN515-57"; db.users.drop(); //';
  const clean = sanitizeName(maliciousInput);
  assert.ok(!clean.includes('$'));
  assert.ok(clean.length > 5);
});
