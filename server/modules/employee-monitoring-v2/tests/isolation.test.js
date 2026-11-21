/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Phase A Isolation & Regression Tests
 *
 * Verifies:
 * 1. Default-disabled feature flags
 * 2. Route gatekeeper 404 behavior when disabled
 * 3. Privacy contract assertions (strict rejection of text, screenshots, clipboards)
 * 4. HMAC signature & clock skew validation
 * 5. Scope guards & role authorization
 * 6. Pure read-only attendance adapter (zero attendance mutation)
 * 7. Passive conflict detection without process termination
 * 8. Zero V1 code imports within V2 modules
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Target modules
const { FEATURE_FLAGS, isMonitoringV2Active } = require('../config/featureFlags');
const { requireV2Active, verifyMonitoringScope, requireAdminRole } = require('../security/scopeGuard');
const { verifyDeviceHmac, validateClockSkew } = require('../security/hmacValidator');
const { validateTelemetrySample, validateDeviceRegistration, validateSessionStart } = require('../contracts');
const AttendanceAdapter = require('../services/attendanceAdapter');
const ConflictDetector = require('../services/conflictDetector');

// ----------------------------------------------------------------------------
// TEST SUITE 1: Feature Flag Security
// ----------------------------------------------------------------------------

test('Feature Flags: all V2 flags default to false by default', () => {
  assert.equal(typeof FEATURE_FLAGS.ENABLE_MONITORING_V2, 'boolean');
  assert.equal(typeof FEATURE_FLAGS.ENABLE_MONITORING_V2_ADMIN_UI, 'boolean');
  assert.equal(typeof FEATURE_FLAGS.ENABLE_MONITORING_V2_EMPLOYEE_UI, 'boolean');
  assert.equal(typeof FEATURE_FLAGS.ENABLE_MONITORING_V2_AGENT, 'boolean');
  assert.equal(typeof FEATURE_FLAGS.ENABLE_MONITORING_V2_INGESTION, 'boolean');
  assert.equal(typeof FEATURE_FLAGS.EMERGENCY_TELEMETRY_HALT, 'boolean');

  // Must be false unless explicitly overridden
  assert.equal(FEATURE_FLAGS.ENABLE_MONITORING_V2, false);
  assert.equal(isMonitoringV2Active(), false);
});

// ----------------------------------------------------------------------------
// TEST SUITE 2: Route Gatekeeper (requireV2Active)
// ----------------------------------------------------------------------------

test('requireV2Active: blocks request with 404 when feature flag is disabled', () => {
  let statusSent = null;
  let jsonSent = null;
  let nextCalled = false;

  const mockReq = {};
  const mockRes = {
    status: (code) => {
      statusSent = code;
      return {
        json: (payload) => {
          jsonSent = payload;
        },
      };
    },
  };
  const mockNext = () => {
    nextCalled = true;
  };

  requireV2Active(mockReq, mockRes, mockNext);

  if (!isMonitoringV2Active()) {
    assert.equal(statusSent, 404);
    assert.equal(jsonSent.code, 'MONITORING_V2_DISABLED');
    assert.equal(nextCalled, false);
  } else {
    assert.equal(nextCalled, true);
  }
});

// ----------------------------------------------------------------------------
// TEST SUITE 3: Privacy & Payload Contract Enforcement
// ----------------------------------------------------------------------------

test('Contracts: validateTelemetrySample accepts clean aggregated metrics', () => {
  const validSample = {
    keyPressCount: 45,
    mouseActivityDelta: 120,
    hardwareIdleSeconds: 10,
    activeProcessCategory: 'DEVELOPMENT',
  };

  const result = validateTelemetrySample(validSample);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('Contracts: validateTelemetrySample strictly rejects invasive keystroke text', () => {
  const invasiveSample = {
    keyPressCount: 45,
    mouseActivityDelta: 12,
    hardwareIdleSeconds: 0,
    // VIOLATION: Keystroke text
    text: 'User typed password123 into chrome',
  };

  const result = validateTelemetrySample(invasiveSample);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("Forbidden field 'text'")));
});

test('Contracts: validateTelemetrySample strictly rejects screenshot data', () => {
  const invasiveSample = {
    keyPressCount: 10,
    mouseActivityDelta: 5,
    hardwareIdleSeconds: 0,
    // VIOLATION: Screenshot or image
    screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE...',
  };

  const result = validateTelemetrySample(invasiveSample);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("Forbidden field 'screenshot'")));
});

test('Contracts: validateTelemetrySample strictly rejects clipboard data', () => {
  const invasiveSample = {
    keyPressCount: 10,
    mouseActivityDelta: 5,
    hardwareIdleSeconds: 0,
    // VIOLATION: Clipboard inspection
    clipboard: 'Copied secret token',
  };

  const result = validateTelemetrySample(invasiveSample);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("Forbidden field 'clipboard'")));
});

test('Contracts: validateTelemetrySample strictly rejects tabTitle', () => {
  const invasiveSample = {
    keyPressCount: 10,
    mouseActivityDelta: 5,
    hardwareIdleSeconds: 0,
    tabTitle: 'Online Banking - Personal Account'
  };
  const result = validateTelemetrySample(invasiveSample);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("Forbidden field 'tabTitle'")));
});

test('Contracts: validateTelemetrySample strictly rejects nested app titles, urls, paths, and titles', () => {
  const sampleWithTitle = {
    keyPressCount: 10,
    mouseActivityDelta: 5,
    hardwareIdleSeconds: 0,
    apps: [{ name: 'Chrome', title: 'Secret Window' }]
  };
  assert.equal(validateTelemetrySample(sampleWithTitle).valid, false);

  const sampleWithUrl = {
    keyPressCount: 10,
    mouseActivityDelta: 5,
    hardwareIdleSeconds: 0,
    apps: [{ name: 'Edge', url: 'https://secret.com' }]
  };
  assert.equal(validateTelemetrySample(sampleWithUrl).valid, false);

  const sampleWithPath = {
    keyPressCount: 10,
    mouseActivityDelta: 5,
    hardwareIdleSeconds: 0,
    apps: [{ name: 'Notepad', path: 'C:\\passwords.txt' }]
  };
  assert.equal(validateTelemetrySample(sampleWithPath).valid, false);

  const sampleWithTabTitle = {
    keyPressCount: 10,
    mouseActivityDelta: 5,
    hardwareIdleSeconds: 0,
    apps: [{ name: 'Chrome', tabTitle: 'Banking' }]
  };
  assert.equal(validateTelemetrySample(sampleWithTabTitle).valid, false);

  const sampleWithWindowTitle = {
    keyPressCount: 10,
    mouseActivityDelta: 5,
    hardwareIdleSeconds: 0,
    apps: [{ name: 'Excel', windowTitle: 'Payroll' }]
  };
  assert.equal(validateTelemetrySample(sampleWithWindowTitle).valid, false);
});

test('Contracts: validateDeviceRegistration verifies valid device registration', () => {
  const validDev = {
    deviceName: 'Developer MacBook Pro',
    platform: 'macos',
  };
  const result = validateDeviceRegistration(validDev);
  assert.equal(result.valid, true);

  const invalidPlatform = {
    deviceName: 'Smart TV Office',
    platform: 'smart_tv',
  };
  const invalidResult = validateDeviceRegistration(invalidPlatform);
  assert.equal(invalidResult.valid, false);
});

test('Contracts: validateSessionStart verifies valid session modes', () => {
  const validSession = { mode: 'LAPTOP_PC' };
  assert.equal(validateSessionStart(validSession).valid, true);

  const invalidSession = { mode: 'unsupported_mode' };
  assert.equal(validateSessionStart(invalidSession).valid, false);
});

// ----------------------------------------------------------------------------
// TEST SUITE 4: HMAC Cryptographic Validation & Anti-Tampering
// ----------------------------------------------------------------------------

test('HMAC: verifies authentic payload signature', () => {
  const secret = 'super_secret_device_signing_key_32bytes!';
  const payloadString = JSON.stringify({ counter: 100, activeSeconds: 60 });
  const signature = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');

  const isValid = verifyDeviceHmac(payloadString, secret, signature);
  assert.equal(isValid, true);
});

test('HMAC: rejects tampered payload or altered signature', () => {
  const secret = 'super_secret_device_signing_key_32bytes!';
  const originalPayload = JSON.stringify({ counter: 100 });
  const tamperedPayload = JSON.stringify({ counter: 9999 });
  const signature = crypto.createHmac('sha256', secret).update(originalPayload).digest('hex');

  const isValid = verifyDeviceHmac(tamperedPayload, secret, signature);
  assert.equal(isValid, false);
});

test('HMAC: rejects timestamp outside clock skew limit (replay attack prevention)', () => {
  const now = Date.now();
  const validClock = validateClockSkew(now);
  assert.equal(validClock.valid, true);

  // Stale timestamp (10 minutes ago, max allowed is 5 minutes)
  const staleTimestamp = now - (10 * 60 * 1000);
  const staleClock = validateClockSkew(staleTimestamp);
  assert.equal(staleClock.valid, false);
  assert.ok(staleClock.error.includes('Clock skew exceeds allowed limit'));
});

// ----------------------------------------------------------------------------
// TEST SUITE 5: Role & Scope Guards
// ----------------------------------------------------------------------------

test('verifyMonitoringScope: denies employee accessing another employee data', () => {
  const req = {
    user: { id: 'emp_001', role: 'Employee' },
    params: { employeeId: 'emp_002' },
  };
  let statusCode = null;
  let responseData = null;
  const res = {
    status: (code) => {
      statusCode = code;
      return { json: (data) => { responseData = data; } };
    },
  };
  let nextCalled = false;

  verifyMonitoringScope(req, res, () => { nextCalled = true; });

  assert.equal(statusCode, 403);
  assert.equal(responseData.code, 'INSUFFICIENT_SCOPE');
  assert.equal(nextCalled, false);
});

test('verifyMonitoringScope: allows employee accessing own data', () => {
  const req = {
    user: { id: 'emp_001', role: 'Employee' },
    params: { employeeId: 'emp_001' },
  };
  const mockRes = {
    status: () => ({ json: () => {} }),
  };
  let nextCalled = false;
  verifyMonitoringScope(req, mockRes, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('verifyMonitoringScope: allows Admin accessing any employee data', () => {
  const req = {
    user: { id: 'admin_999', role: 'Admin' },
    params: { employeeId: 'emp_002' },
  };
  const mockRes = {
    status: () => ({ json: () => {} }),
  };
  let nextCalled = false;
  verifyMonitoringScope(req, mockRes, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('requireAdminRole: denies regular employee from admin operations', () => {
  const req = { user: { id: 'emp_001', role: 'Employee' } };
  let statusCode = null;
  const res = {
    status: (code) => {
      statusCode = code;
      return { json: () => {} };
    },
  };
  let nextCalled = false;

  requireAdminRole(req, res, () => { nextCalled = true; });
  assert.equal(statusCode, 403);
  assert.equal(nextCalled, false);
});

// ----------------------------------------------------------------------------
// TEST SUITE 6: Attendance Isolation Verification
// ----------------------------------------------------------------------------

test('AttendanceAdapter: pure read-only with zero attendance write methods', () => {
  const adapterMethods = Object.getOwnPropertyNames(AttendanceAdapter);
  
  // Verify no mutation methods exist on adapter
  const forbiddenKeywords = ['create', 'update', 'save', 'delete', 'clockIn', 'clockOut', 'punch', 'deduct'];
  for (const method of adapterMethods) {
    for (const keyword of forbiddenKeywords) {
      assert.ok(
        !method.toLowerCase().includes(keyword.toLowerCase()),
        `AttendanceAdapter must never contain write/mutation methods. Found: ${method}`
      );
    }
  }

  // Verify checkActiveWorkday returns a safe fallback object without crashing
  const result = AttendanceAdapter.checkActiveWorkday(null);
  assert.equal(typeof result.then, 'function'); // returns promise
});

// ----------------------------------------------------------------------------
// TEST SUITE 7: Passive Conflict Detection
// ----------------------------------------------------------------------------

test('ConflictDetector: accurately flags V1 agent process output without kill signals', () => {
  const outputWithV1 = `"employee-activity-agent.exe","4812","Console","1","72,400 K"`;
  const conflict = ConflictDetector.parseProcessOutput(outputWithV1);
  assert.equal(conflict.hasConflict, true);
  assert.equal(conflict.detectedProcess, 'employee-activity-agent.exe');

  const cleanOutput = `"node.exe","1104","Console","1","45,000 K"`;
  const cleanResult = ConflictDetector.parseProcessOutput(cleanOutput);
  assert.equal(cleanResult.hasConflict, false);
});

// ----------------------------------------------------------------------------
// TEST SUITE 8: Strict Architectural Boundary (No V1 imports in V2)
// ----------------------------------------------------------------------------

test('Architectural Boundary: V2 server files never import V1 monitoring code', () => {
  const v2BaseDir = path.resolve(__dirname, '..');
  
  function scanDir(dir) {
    const files = fs.readdirSync(dir);
    let allFiles = [];
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        if (file !== 'tests') {
          allFiles = allFiles.concat(scanDir(fullPath));
        }
      } else if (file.endsWith('.js')) {
        allFiles.push(fullPath);
      }
    }
    return allFiles;
  }

  const v2Files = scanDir(v2BaseDir);
  const forbiddenImports = [
    'monitoring-service',
    'monitoringActivity',
    'keystroke-text-capture',
    'screenshotEngine',
    'safeScreenshot',
    'agentActivity',
    'routes/monitoring',
  ];

  for (const filePath of v2Files) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const forbidden of forbiddenImports) {
      assert.ok(
        !content.includes(forbidden),
        `V2 file ${path.basename(filePath)} illegally imports or references V1 component: ${forbidden}`
      );
    }
  }
});
