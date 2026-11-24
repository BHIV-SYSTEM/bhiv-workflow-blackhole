/**
 * Employee Monitoring V2 - Admin & Fleet Analytics Routes
 * 
 * Endpoints:
 * - GET /api/monitoring-v2/admin/live-team (Auth: Admin / Manager)
 * - GET /api/monitoring-v2/admin/summary (Auth: Admin / Manager)
 * - GET /api/monitoring-v2/admin/audit-logs (Auth: Admin)
 */

const express = require('express');
const router = express.Router();
const v2Auth = require('../security/v2Auth');
const { requireAdminRole } = require('../security/scopeGuard');
const analyticsService = require('../services/analyticsService');

// Require Admin/Manager for all admin routes
router.use(v2Auth, requireAdminRole);

// GET /api/monitoring-v2/admin/live-team
router.get('/live-team', async (req, res) => {
  try {
    const liveTeam = await analyticsService.getLiveTeam();
    return res.json({ success: true, count: liveTeam.length, team: liveTeam });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/monitoring-v2/admin/summary
router.get('/summary', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const summary = await analyticsService.getTeamSummary({ startDate, endDate });
    return res.json({ success: true, ...summary });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/monitoring-v2/admin/reports
router.get('/reports', async (req, res) => {
  try {
    const { startDate, endDate, employeeId, department } = req.query;
    const DailyActivityReport = require('../models/DailyActivityReport');
    const query = {};
    if (employeeId) query.employee = employeeId;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }

    let reports = await DailyActivityReport.find(query)
      .populate('employee', 'name email department role employeeId')
      .sort({ date: -1 })
      .lean();

    if (department && department !== 'All Departments') {
      reports = reports.filter((r) => r.employee?.department === department);
    }

    return res.json({ success: true, count: reports.length, reports });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/monitoring-v2/admin/audit-logs
router.get('/audit-logs', async (req, res) => {
  try {
    const { employeeId, eventType, limit, skip } = req.query;
    const result = await analyticsService.getAuditLogs({
      employeeId,
      eventType,
      limit: limit ? parseInt(limit, 10) : 50,
      skip: skip ? parseInt(skip, 10) : 0
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
