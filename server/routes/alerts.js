const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const MonitoringAlert = require('../models/MonitoringAlert');
const auth = require('../middleware/auth');

function getUserId(req) {
  return req.user ? (req.user._id || req.user.id) : null;
}

function isManagerOrAdmin(req) {
  if (!req.user) return false;
  const role = String(req.user.role || '').toLowerCase();
  return role === 'admin' || role === 'manager' || req.user.isAdmin === true;
}

// @route   GET /api/alerts
// @desc    Get alerts with optional filtering (scoped to user for non-admins)
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const query = {};

    // Scope check: non-admins can only see their own alerts
    if (!isManagerOrAdmin(req) || req.query.employeeId) {
      const targetEmployee = isManagerOrAdmin(req) ? req.query.employeeId : userId;
      if (mongoose.Types.ObjectId.isValid(targetEmployee)) {
        query.employee = new mongoose.Types.ObjectId(targetEmployee);
      } else {
        query.employee = targetEmployee;
      }
    }

    // Filter by tier (WHITE, YELLOW, RED)
    if (req.query.tier) {
      query.tier = String(req.query.tier).toUpperCase();
    }

    // Filter by status (ACTIVE, EXPLAINED, RESOLVED, DISMISSED)
    if (req.query.status) {
      const statusParam = String(req.query.status).toUpperCase();
      if (statusParam === 'OPEN') {
        query.status = { $in: ['ACTIVE', 'EXPLAINED'] };
      } else if (statusParam !== 'ALL') {
        query.status = statusParam;
      }
    }

    // Filter by explanation_status
    if (req.query.explanation_status) {
      query.explanation_status = req.query.explanation_status;
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

    const alerts = await MonitoringAlert.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .populate('employee', 'name email department')
      .populate('resolved_by', 'name email')
      .populate('acknowledged_by', 'name email')
      .populate('related_task', 'title status dueDate task_id');

    res.json(alerts);
  } catch (err) {
    console.error('[alerts] GET error:', err.message);
    res.status(500).json({ error: 'Server Error', details: err.message });
  }
});

// @route   GET /api/alerts/:alertId
// @desc    Get a single alert by ID
// @access  Private
router.get('/:alertId', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.alertId)) {
      return res.status(400).json({ error: 'Invalid alert ID' });
    }

    const alert = await MonitoringAlert.findById(req.params.alertId)
      .populate('employee', 'name email department')
      .populate('resolved_by', 'name email')
      .populate('acknowledged_by', 'name email')
      .populate('related_task', 'title status dueDate task_id');

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const userId = getUserId(req);
    if (!isManagerOrAdmin(req) && String(alert.employee._id || alert.employee) !== String(userId)) {
      return res.status(403).json({ error: 'Not authorized to view this alert' });
    }

    res.json(alert);
  } catch (err) {
    console.error('[alerts] GET /:alertId error:', err.message);
    res.status(500).json({ error: 'Server Error', details: err.message });
  }
});

// @route   POST /api/alerts/:alertId/explain
// @desc    Submit employee explanation for an alert
// @access  Private (Employee or Admin)
router.post('/:alertId/explain', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.alertId)) {
      return res.status(400).json({ success: false, error: 'Invalid alert ID' });
    }

    const alert = await MonitoringAlert.findById(req.params.alertId);
    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

    const userId = getUserId(req);
    // Only the employee owning the alert or an admin can explain
    if (!isManagerOrAdmin(req) && String(alert.employee) !== String(userId)) {
      return res.status(403).json({ success: false, error: 'Not authorized to explain this alert' });
    }

    const explanation = req.body && req.body.explanation;
    if (!explanation || typeof explanation !== 'string' || !explanation.trim()) {
      return res.status(400).json({ success: false, error: 'Explanation text is required' });
    }

    alert.employee_explanation = explanation.trim();
    alert.explained_at = new Date();
    alert.explanation_status = 'pending_review';
    alert.status = 'EXPLAINED';

    await alert.save();

    res.json({
      success: true,
      message: 'Explanation submitted successfully',
      alert: {
        id: String(alert._id),
        status: alert.status,
        explanation_status: alert.explanation_status,
        employee_explanation: alert.employee_explanation,
        explained_at: alert.explained_at
      }
    });
  } catch (err) {
    console.error('[alerts] POST /:alertId/explain error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to submit explanation', details: err.message });
  }
});

// @route   POST /api/alerts/:alertId/resolve
// @desc    Admin review and resolve alert (verdict + resolution notes, ZERO automated penalties)
// @access  Private (Admin / Manager)
router.post('/:alertId/resolve', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.alertId)) {
      return res.status(400).json({ success: false, error: 'Invalid alert ID' });
    }

    if (!isManagerOrAdmin(req)) {
      return res.status(403).json({ success: false, error: 'Admin or Manager role required to resolve alerts' });
    }

    const { verdict, resolution_notes } = req.body || {};
    const validVerdicts = ['cleared', 'acknowledged', 'escalated'];
    if (!verdict || !validVerdicts.includes(verdict)) {
      return res.status(400).json({
        success: false,
        error: `Invalid verdict. Must be one of: ${validVerdicts.join(', ')}`
      });
    }

    const alert = await MonitoringAlert.findById(req.params.alertId);
    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

    const userId = getUserId(req);
    alert.admin_verdict = verdict;
    alert.resolution_notes = resolution_notes ? String(resolution_notes).trim() : '';
    alert.resolved_by = userId ? new mongoose.Types.ObjectId(userId) : null;
    alert.resolved_at = new Date();
    alert.status = 'RESOLVED';

    // Update explanation status based on verdict
    if (verdict === 'cleared') {
      alert.explanation_status = 'accepted';
    } else if (alert.explanation_status === 'pending_review') {
      alert.explanation_status = 'rejected';
    }

    // ZERO automated behavioral penalties are applied
    await alert.save();

    res.json({
      success: true,
      message: 'Alert resolved successfully without automated penalties',
      alert: {
        id: String(alert._id),
        status: alert.status,
        admin_verdict: alert.admin_verdict,
        resolution_notes: alert.resolution_notes,
        resolved_by: alert.resolved_by,
        resolved_at: alert.resolved_at,
        explanation_status: alert.explanation_status
      }
    });
  } catch (err) {
    console.error('[alerts] POST /:alertId/resolve error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to resolve alert', details: err.message });
  }
});

// @route   POST /api/alerts/:alertId/dismiss
// @desc    Dismiss an alert
// @access  Private (Admin / Manager)
router.post('/:alertId/dismiss', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.alertId)) {
      return res.status(400).json({ success: false, error: 'Invalid alert ID' });
    }

    const alert = await MonitoringAlert.findById(req.params.alertId);
    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

    alert.status = 'DISMISSED';
    alert.resolution_notes = (req.body && req.body.notes) ? String(req.body.notes).trim() : 'Dismissed';
    await alert.save();

    res.json({
      success: true,
      message: 'Alert dismissed',
      alert: {
        id: String(alert._id),
        status: alert.status
      }
    });
  } catch (err) {
    console.error('[alerts] POST /:alertId/dismiss error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to dismiss alert', details: err.message });
  }
});

module.exports = router;
