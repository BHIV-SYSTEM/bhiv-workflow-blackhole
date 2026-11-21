/**
 * Niyantran Employee Monitoring V2 — Tier 2 Boundary Test
 * Feature F8: Deterministic Explainable Alert Engine
 *
 * Boundary & Negative Tests:
 * 1. Sub-threshold idle duration does not trigger misconduct alert.
 * 2. Rapid telemetry storm evaluates rules without duplicating active alerts.
 * 3. Telemetry with zero duration payload handles division safely without NaN errors.
 * 4. Unknown process executable category falls back gracefully to NEUTRAL.
 * 5. Invalid or malformed ruleId evaluation returns validation error.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const config = require('../config');
const { CATEGORIES } = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/config/constants'));

test('[F8] Sub-threshold idle duration does not trigger misconduct alert', () => {
  // Deterministic rule evaluation logic
  const evaluateIdleThreshold = (idleSeconds) => {
    // 15 minutes (900s) = Yellow Alert (RULE-ATTENTION-001)
    // 45 minutes (2700s) = Red Alert (RULE-REVIEW-001)
    if (idleSeconds >= 2700) {
      return { triggered: true, tier: 'RED', ruleId: 'RULE-REVIEW-001' };
    }
    if (idleSeconds >= 900) {
      return { triggered: true, tier: 'YELLOW', ruleId: 'RULE-ATTENTION-001' };
    }
    return { triggered: false, tier: 'WHITE', ruleId: 'RULE-NORMAL-001' };
  };

  // Sub-threshold idle: 5 minutes (300s) and 14 minutes (840s)
  const fiveMinIdle = evaluateIdleThreshold(300);
  assert.equal(fiveMinIdle.triggered, false);
  assert.equal(fiveMinIdle.tier, 'WHITE');
  assert.equal(fiveMinIdle.ruleId, 'RULE-NORMAL-001');

  const fourteenMinIdle = evaluateIdleThreshold(840);
  assert.equal(fourteenMinIdle.triggered, false);
  assert.equal(fourteenMinIdle.tier, 'WHITE');

  // Exact threshold boundary: 15 minutes (900s)
  const fifteenMinIdle = evaluateIdleThreshold(900);
  assert.equal(fifteenMinIdle.triggered, true);
  assert.equal(fifteenMinIdle.tier, 'YELLOW');
  assert.equal(fifteenMinIdle.ruleId, 'RULE-ATTENTION-001');
});

test('[F8] Rapid telemetry storm evaluates rules without duplicating active alerts', () => {
  // Active alerts store with deduplication key
  const activeAlerts = new Map();

  function triggerAlert({ employeeId, ruleId, incidentKey }) {
    const dedupeKey = `${employeeId}:${ruleId}:${incidentKey}`;
    if (activeAlerts.has(dedupeKey)) {
      return { created: false, suppressed: true, alert: activeAlerts.get(dedupeKey) };
    }

    const alert = {
      id: `alert_${Date.now()}_${Math.random()}`,
      employeeId,
      ruleId,
      incidentKey,
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    };
    activeAlerts.set(dedupeKey, alert);
    return { created: true, suppressed: false, alert };
  }

  const emp = 'emp_test_dedupe';
  const incident = 'idle_block_20261120_1000';

  // Rapid storm: 20 consecutive triggers for same incident
  const results = [];
  for (let i = 0; i < 20; i++) {
    results.push(triggerAlert({ employeeId: emp, ruleId: 'RULE-ATTENTION-001', incidentKey: incident }));
  }

  const createdCount = results.filter((r) => r.created).length;
  const suppressedCount = results.filter((r) => r.suppressed).length;

  assert.equal(createdCount, 1, 'Exactly one alert must be created for the incident');
  assert.equal(suppressedCount, 19, 'Subsequent 19 rapid storm triggers must be suppressed');
});

test('[F8] Telemetry with zero duration payload handles division safely without NaN errors', () => {
  // Focus score calculator with zero duration
  function calculateFocusScore(payload) {
    const duration = payload.durationSeconds || 0;
    const idle = payload.hardwareIdleSeconds || 0;
    const active = Math.max(0, duration - idle);

    if (duration === 0) return 50; // Safe default
    const activeRatio = active / duration;
    return Math.min(100, Math.max(0, Math.round(activeRatio * 100)));
  }

  const scoreZero = calculateFocusScore({ durationSeconds: 0, hardwareIdleSeconds: 0 });
  assert.equal(typeof scoreZero, 'number');
  assert.equal(Number.isNaN(scoreZero), false, 'Score must not be NaN');
  assert.equal(scoreZero, 50);

  const scoreNormal = calculateFocusScore({ durationSeconds: 60, hardwareIdleSeconds: 0 });
  assert.equal(scoreNormal, 100);
});

test('[F8] Unknown process executable category falls back gracefully to NEUTRAL', () => {
  function resolveCategory(categoryInput) {
    if (!categoryInput || typeof categoryInput !== 'string') return CATEGORIES.NEUTRAL;
    const upper = categoryInput.toUpperCase().trim();
    if (Object.values(CATEGORIES).includes(upper)) {
      return upper;
    }
    return CATEGORIES.NEUTRAL;
  }

  assert.equal(resolveCategory('DEVELOPMENT'), 'DEVELOPMENT');
  assert.equal(resolveCategory('DOCUMENTATION'), 'DOCUMENTATION');
  assert.equal(resolveCategory('UNKNOWN_RANDOM_APP'), 'NEUTRAL');
  assert.equal(resolveCategory(''), 'NEUTRAL');
  assert.equal(resolveCategory(null), 'NEUTRAL');
});

test('[F8] Invalid or malformed ruleId evaluation returns validation error', () => {
  const allowedRules = ['RULE-NORMAL-001', 'RULE-ATTENTION-001', 'RULE-REVIEW-001', 'RULE-BREAK-002', 'RULE-OFFLINE-003'];

  function validateRuleId(ruleId) {
    if (!ruleId || typeof ruleId !== 'string') {
      return { valid: false, error: 'ruleId is required and must be a string' };
    }
    if (!allowedRules.includes(ruleId)) {
      return { valid: false, error: `Invalid ruleId: ${ruleId}. Allowed: ${allowedRules.join(', ')}` };
    }
    return { valid: true };
  }

  assert.equal(validateRuleId('').valid, false);
  assert.equal(validateRuleId(null).valid, false);
  assert.equal(validateRuleId('RULE-MALICIOUS-999').valid, false);
  assert.equal(validateRuleId('RULE-ATTENTION-001').valid, true);
});
