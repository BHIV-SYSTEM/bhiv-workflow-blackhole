/**
 * Employee Monitoring V2 - Session Routes
 * 
 * Endpoints:
 * - POST /api/monitoring-v2/sessions/start
 * - POST /api/monitoring-v2/sessions/:sessionId/pause
 * - POST /api/monitoring-v2/sessions/:sessionId/resume
 * - POST /api/monitoring-v2/sessions/:sessionId/end
 * - POST /api/monitoring-v2/sessions/:sessionId/renew-lease
 * - GET  /api/monitoring-v2/sessions/current
 */

const express = require('express');
const router = express.Router();
const v2Auth = require('../security/v2Auth');
const sessionService = require('../services/sessionService');
const handoffService = require('../services/handoffService');
const RegisteredDevice = require('../models/RegisteredDevice');
const MonitoringSessionV2 = require('../models/MonitoringSessionV2');

// GET /api/monitoring-v2/sessions/active-device-session
// Allows an enrolled desktop agent to obtain or initialize an authorized session
router.get('/active-device-session', async (req, res) => {
  try {
    const deviceId = req.headers['x-device-id'] || req.query?.deviceId;
    if (!deviceId) {
      return res.status(400).json({ error: 'x-device-id header is required', code: 'DEVICE_ID_REQUIRED' });
    }

    const device = await RegisteredDevice.findOne({ device_id: deviceId });
    if (!device || device.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Device not enrolled or revoked', code: 'DEVICE_NOT_ACTIVE' });
    }

    let session = await MonitoringSessionV2.findOne({
      active_device: deviceId,
      state: 'ACTIVE'
    }).sort({ started_at: -1 });

    if (!session) {
      session = await sessionService.startSession({
        employeeId: device.employee,
        mode: 'LAPTOP_PC',
        deviceId: device.device_id,
        taskId: 'TASK-WIN32-DESKTOP'
      });
    }

    return res.json({
      success: true,
      sessionId: session.session_id || session.sessionId,
      state: session.state,
      leaseSeconds: 60
    });
  } catch (err) {
    return res.status(500).json({ error: err.message, code: 'DEVICE_SESSION_FAILED' });
  }
});

// POST /api/monitoring-v2/sessions/start
router.post('/start', v2Auth, async (req, res) => {
  try {
    const employeeId = req.user.id || req.user._id;
    const { mode, deviceId, taskId } = req.body;

    const session = await sessionService.startSession({
      employeeId,
      mode,
      deviceId,
      taskId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(201).json({ success: true, ...session });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      error: err.message,
      code: err.code || 'SESSION_START_FAILED'
    });
  }
});

// POST /api/monitoring-v2/sessions/:sessionId/pause
router.post('/:sessionId/pause', v2Auth, async (req, res) => {
  try {
    const employeeId = req.user.id || req.user._id;
    const { sessionId } = req.params;
    const reason = req.body?.reason || 'Break';

    const result = await sessionService.pauseSession(sessionId, employeeId, reason);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      error: err.message,
      code: err.code || 'SESSION_PAUSE_FAILED'
    });
  }
});

// POST /api/monitoring-v2/sessions/:sessionId/resume
router.post('/:sessionId/resume', v2Auth, async (req, res) => {
  try {
    const employeeId = req.user.id || req.user._id;
    const { sessionId } = req.params;

    const result = await sessionService.resumeSession(sessionId, employeeId);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      error: err.message,
      code: err.code || 'SESSION_RESUME_FAILED'
    });
  }
});

// POST /api/monitoring-v2/sessions/:sessionId/end
router.post('/:sessionId/end', v2Auth, async (req, res) => {
  try {
    const employeeId = req.user.id || req.user._id;
    const requestingUserRole = req.user.role || 'User';
    const { sessionId } = req.params;

    const result = await sessionService.endSession(sessionId, employeeId, requestingUserRole);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      error: err.message,
      code: err.code || 'SESSION_END_FAILED'
    });
  }
});

// POST /api/monitoring-v2/sessions/:sessionId/renew-lease
router.post('/:sessionId/renew-lease', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const deviceId = req.headers['x-device-id'] || req.body?.deviceId;

    if (!deviceId) {
      return res.status(400).json({ error: 'x-device-id header or deviceId is required', code: 'DEVICE_ID_REQUIRED' });
    }

    const result = await sessionService.renewLease(sessionId, deviceId);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      error: err.message,
      code: err.code || 'LEASE_RENEWAL_FAILED'
    });
  }
});

// GET /api/monitoring-v2/sessions/current
router.get('/current', v2Auth, async (req, res) => {
  try {
    const employeeId = req.user.id || req.user._id;
    const session = await sessionService.getCurrentSession(employeeId);
    return res.json({ success: true, session });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/monitoring-v2/sessions/:sessionId/handoff
router.post('/:sessionId/handoff', v2Auth, async (req, res) => {
  try {
    const employeeId = req.user.id || req.user._id;
    const { sessionId } = req.params;
    const { targetMode, targetDeviceId, reason } = req.body;

    const result = await handoffService.initiateHandoff({
      sessionId,
      employeeId,
      targetMode,
      targetDeviceId,
      reason,
      io: req.io
    });

    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      error: err.message,
      code: err.code || 'HANDOFF_FAILED'
    });
  }
});

module.exports = router;
