/**
 * Employee Monitoring V2 - Device Routes
 * 
 * Endpoints:
 * - POST /api/monitoring-v2/devices/enrollment-code (Auth: Employee)
 * - POST /api/monitoring-v2/devices/pair (Auth: One-Time Pairing Code)
 * - GET  /api/monitoring-v2/devices (Auth: Scoped Employee or Admin)
 * - POST /api/monitoring-v2/devices/:deviceId/revoke (Auth: Owner or Admin)
 */

const express = require('express');
const router = express.Router();
const v2Auth = require('../security/v2Auth');
const deviceService = require('../services/deviceService');

// POST /api/monitoring-v2/devices/enrollment-code
router.post('/enrollment-code', v2Auth, (req, res) => {
  try {
    const employeeId = req.user.id || req.user._id;
    const result = deviceService.generateEnrollmentCode(employeeId, {
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      error: err.message,
      code: err.code || 'ENROLLMENT_ERROR'
    });
  }
});

// POST /api/monitoring-v2/devices/pair
router.post('/pair', async (req, res) => {
  try {
    const { pairingCode, deviceName, platform, osVersion, agentVersion, manufacturer, model, machineUuid, machine_uuid } = req.body;
    const result = await deviceService.pairDevice({
      pairingCode,
      deviceName,
      platform,
      osVersion,
      agentVersion,
      manufacturer,
      model,
      machineUuid: machineUuid || machine_uuid,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      error: err.message,
      code: err.code || 'PAIRING_FAILED',
      details: err.details
    });
  }
});

// GET /api/monitoring-v2/devices
router.get('/', v2Auth, async (req, res) => {
  try {
    const requestingUserId = req.user.id || req.user._id;
    const isAdmin = req.user.role === 'Admin' || req.user.role === 'SuperAdmin';
    const targetEmployeeId = isAdmin && req.query.employeeId
      ? req.query.employeeId
      : requestingUserId;

    const devices = await deviceService.getEmployeeDevices(targetEmployeeId);
    return res.json({ success: true, devices });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/monitoring-v2/devices/:deviceId/revoke
router.post('/:deviceId/revoke', v2Auth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const requestingUserId = req.user.id || req.user._id;
    const requestingUserRole = req.user.role || 'User';
    const reason = req.body?.reason || 'Revoked via console';

    const result = await deviceService.revokeDevice(deviceId, requestingUserId, requestingUserRole, reason);
    return res.json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      error: err.message,
      code: err.code || 'REVOCATION_FAILED'
    });
  }
});

module.exports = router;
