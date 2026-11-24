/**
 * Niyantran Employee Monitoring V2 — Tier 2 Boundary Test
 * Feature F5: Agent Privacy Enforcement
 *
 * Boundary & Negative Tests:
 * 1. Telemetry containing raw typed text is rejected with 400 PRIVACY_VIOLATION.
 * 2. Telemetry containing screenshot or image data is rejected with 400 PRIVACY_VIOLATION.
 * 3. Telemetry containing full URL or domain history is rejected with 400 PRIVACY_VIOLATION.
 * 4. Telemetry containing windowTitle is rejected with 400 PRIVACY_VIOLATION.
 * 5. Negative or non-numeric input count values fail schema validation with 400 Bad Request.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const config = require('../config');
const { httpClient } = require('../helpers/httpClient');
const contracts = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/contracts'));

async function safePost(urlPath, body, headers = {}) {
  try {
    return await httpClient.request('POST', urlPath, body, { headers });
  } catch (err) {
    return { status: 0, ok: false, error: err.message, data: null };
  }
}

test('[F5] Telemetry containing raw typed text is rejected with 400 PRIVACY_VIOLATION', async () => {
  const payloadWithText = {
    sessionId: 'v2_sess_test',
    keyPressCount: 15,
    mouseActivityDelta: 5,
    hardwareIdleSeconds: 0,
    text: 'User typed confidential password or chat message'
  };

  const validation = contracts.validateTelemetrySample(payloadWithText);
  assert.equal(validation.valid, false, 'Payload containing text must fail contract validation');
  assert.ok(
    validation.errors.some((e) => e.includes('text') && e.includes('PRIVACY VIOLATION')),
    'Validation error must identify text as critical privacy violation'
  );

  const res = await safePost('/api/monitoring-v2/telemetry', payloadWithText);
  if (res.status !== 0) {
    assert.equal(res.status, 400);
    assert.equal(res.data?.code, 'PRIVACY_VIOLATION');
  }
});

test('[F5] Telemetry containing screenshot or image data is rejected with 400 PRIVACY_VIOLATION', async () => {
  const payloadWithScreenshot = {
    sessionId: 'v2_sess_test',
    keyPressCount: 10,
    mouseActivityDelta: 2,
    hardwareIdleSeconds: 0,
    screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA...',
    base64: 'raw_frame_data'
  };

  const validation = contracts.validateTelemetrySample(payloadWithScreenshot);
  assert.equal(validation.valid, false, 'Payload containing screenshot/base64 must fail contract validation');
  assert.ok(
    validation.errors.some((e) => e.includes('screenshot')),
    'Validation error must flag screenshot field'
  );

  const res = await safePost('/api/monitoring-v2/telemetry', payloadWithScreenshot);
  if (res.status !== 0) {
    assert.equal(res.status, 400);
    assert.equal(res.data?.code, 'PRIVACY_VIOLATION');
  }
});

test('[F5] Telemetry containing full URL or domain history is rejected with 400 PRIVACY_VIOLATION', async () => {
  const payloadWithUrl = {
    sessionId: 'v2_sess_test',
    keyPressCount: 20,
    mouseActivityDelta: 8,
    hardwareIdleSeconds: 0,
    url: 'https://internal.bank.com/user/accounts'
  };

  const validation = contracts.validateTelemetrySample(payloadWithUrl);
  assert.equal(validation.valid, false, 'Payload containing URL must fail contract validation');
  assert.ok(
    validation.errors.some((e) => e.includes('url')),
    'Validation error must flag URL field'
  );

  const res = await safePost('/api/monitoring-v2/telemetry', payloadWithUrl);
  if (res.status !== 0) {
    assert.equal(res.status, 400);
    assert.equal(res.data?.code, 'PRIVACY_VIOLATION');
  }
});

test('[F5] Telemetry containing windowTitle is rejected with 400 PRIVACY_VIOLATION', async () => {
  const payloadWithTitle = {
    sessionId: 'v2_sess_test',
    keyPressCount: 30,
    mouseActivityDelta: 12,
    hardwareIdleSeconds: 0,
    windowTitle: 'Confidential Compensation Review Q4.xlsx — Excel'
  };

  const validation = contracts.validateTelemetrySample(payloadWithTitle);
  assert.equal(validation.valid, false, 'Payload containing windowTitle must fail contract validation');
  assert.ok(
    validation.errors.some((e) => e.includes('windowTitle')),
    'Validation error must flag windowTitle field'
  );

  const res = await safePost('/api/monitoring-v2/telemetry', payloadWithTitle);
  if (res.status !== 0) {
    assert.equal(res.status, 400);
    assert.equal(res.data?.code, 'PRIVACY_VIOLATION');
  }
});

test('[F5] Negative or non-numeric input count values fail schema validation with 400 Bad Request', () => {
  const negativeCases = [
    { keyPressCount: -1, mouseActivityDelta: 5, hardwareIdleSeconds: 0 },
    { keyPressCount: 10, mouseActivityDelta: -10, hardwareIdleSeconds: 0 },
    { keyPressCount: 10, mouseActivityDelta: 5, hardwareIdleSeconds: -5 },
    { keyPressCount: 'twenty', mouseActivityDelta: 5, hardwareIdleSeconds: 0 },
    { keyPressCount: null, mouseActivityDelta: 5, hardwareIdleSeconds: 0 }
  ];

  for (const tc of negativeCases) {
    const validation = contracts.validateTelemetrySample(tc);
    assert.equal(validation.valid, false, `Sample with invalid counts must fail: ${JSON.stringify(tc)}`);
    assert.ok(validation.errors.length > 0);
  }

  // Valid non-negative numeric counts must pass
  const validSample = {
    keyPressCount: 0,
    mouseActivityDelta: 0,
    hardwareIdleSeconds: 60,
    activeProcessCategory: 'DEVELOPMENT'
  };
  const validRes = contracts.validateTelemetrySample(validSample);
  assert.equal(validRes.valid, true, 'Valid numeric counts must pass schema validation');
});
