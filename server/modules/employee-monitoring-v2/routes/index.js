/**
 * Employee Monitoring V2 - Root API Router
 * 
 * Namespaced under /api/monitoring-v2/*
 * Enforces requireV2Active middleware globally across all V2 endpoints.
 * When ENABLE_MONITORING_V2 is false, all routes return 404 Not Found.
 */

const express = require('express');
const router = express.Router();
const { requireV2Active } = require('../security/scopeGuard');

// Global V2 Feature Flag Guard
router.use(requireV2Active);

// Foundation Status Ping
router.get('/ping', (req, res) => {
  res.json({
    service: 'niyantran-employee-monitoring-v2',
    status: 'ACTIVE',
    phase: 'Phase D: Secure Backend & Live Telemetry Integration',
    timestamp: new Date().toISOString()
  });
});

// V2 Submodules
router.use('/devices', require('./devices'));
router.use('/sessions', require('./sessions'));
router.use('/telemetry', require('./telemetry'));
router.use('/admin', require('./admin'));
router.use('/analytics', require('./admin'));
router.use('/installer', require('./installer'));

module.exports = router;
