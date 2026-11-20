/**
 * Employee Monitoring V2 - Telemetry Ingestion & Aggregation Routes
 * 
 * Endpoints:
 * - POST /api/monitoring-v2/telemetry (HMAC Device Signed)
 * - GET  /api/monitoring-v2/telemetry/aggregated (Auth: Scoped Employee or Admin)
 * - GET  /api/monitoring-v2/telemetry/timeline (Auth: Scoped Employee or Admin)
 */

const express = require('express');
const router = express.Router();
const v2Auth = require('../security/v2Auth');
const { verifyMonitoringScope } = require('../security/scopeGuard');
const telemetryService = require('../services/telemetryService');
const analyticsService = require('../services/analyticsService');

// POST /api/monitoring-v2/telemetry (Device HMAC signed)
router.post('/', async (req, res) => {
  const deviceId = req.headers['x-device-id'];
  const signature = req.headers['x-device-signature'];
  const timestamp = req.headers['x-timestamp'] || req.headers['x-client-timestamp'];

  if (!deviceId || !signature || !timestamp) {
    return res.status(400).json({
      error: 'Missing required device authentication headers (x-device-id, x-device-signature, x-timestamp)',
      code: 'MISSING_AUTH_HEADERS'
    });
  }

  // Obtain raw body string for exact HMAC signature matching
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

  try {
    const result = await telemetryService.ingestTelemetry({
      deviceId,
      rawBody,
      signature,
      timestamp,
      ip: req.ip
    });

    return res.status(200).json(result);
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({
      error: err.message,
      code: err.code || 'INGESTION_ERROR',
      revoked: Boolean(err.revoked),
      rollback: Boolean(err.rollback),
      details: err.details
    });
  }
});

// GET /api/monitoring-v2/telemetry/aggregated
router.get('/aggregated', v2Auth, verifyMonitoringScope, async (req, res) => {
  try {
    const requestingUserId = req.user.id || req.user._id;
    const targetEmployeeId = req.query.employeeId || requestingUserId;
    const { startDate, endDate, sessionId, limit } = req.query;

    const records = await telemetryService.getAggregatedTelemetry(targetEmployeeId, {
      startDate,
      endDate,
      sessionId,
      limit: limit ? parseInt(limit, 10) : 100
    });

    return res.json({ success: true, count: records.length, records });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/monitoring-v2/telemetry/timeline
router.get('/timeline', v2Auth, verifyMonitoringScope, async (req, res) => {
  try {
    const requestingUserId = req.user.id || req.user._id;
    const targetEmployeeId = req.query.employeeId || requestingUserId;
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const timeline = await analyticsService.getEmployeeDailyTimeline(targetEmployeeId, date);
    return res.json({ success: true, ...timeline });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
