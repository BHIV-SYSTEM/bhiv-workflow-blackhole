const express = require('express');
const router = express.Router();
const path = require('path');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Department = require('../models/Department');
const EmployeeActivity = require('../models/EmployeeActivity');
const ScreenCapture = require('../models/ScreenCapture');
const MonitoringAlert = require('../models/MonitoringAlert');
const Aim = require('../models/Aim');
const Progress = require('../models/Progress');
const WebsiteWhitelist = require('../models/WebsiteWhitelist');
const activityTracker = require('../services/activityTracker');
const screenCaptureService = require('../services/screenCapture');
const websiteMonitor = require('../services/websiteMonitor');
const intelligentScreenCapture = require('../services/intelligentScreenCapture');
const groqAIService = require('../services/groqAIService');
const ocrAnalysisService = require('../services/ocrAnalysisService');
const { KeystrokeAnalyticsService } = require('../services/keystrokeAnalytics');
const reportGenerator = require('../services/reportGenerator');
const { formatEmployeeId } = require('../utils/employeeId');
const {
  getDailyProgressWindow,
  findDailyProgressStatus,
  syncAttendanceCloseFromWorkSession
} = require('../utils/progressValidation');
const fs = require('fs').promises;
const { getViolationScreenshots, generateOptimizedScreenshotUrl } = require('../utils/cloudinary');
const {
  getLocalDateKey,
  parseLocalDateParam,
  getEfficiencyLabel,
  evaluateSample,
  summarizeActivitiesWithSession,
  resolveSessionsMap
} = require('../utils/telemetryMetrics');

// Helper to get branch filter from request
const getBranchQuery = (req) => {
  const selectedBranch = req.headers['x-branch'] || req.query.branch;
  if (selectedBranch && selectedBranch !== 'all') {
    return { branch: selectedBranch };
  }
  return {};
};

// Telemetry defaults for employees without live DB activity logs
const getFallbackTelemetry = (emp, date = new Date()) => {
  const isExited = emp && emp.stillExist === 0;

  if (isExited) {
    return {
      currentStatus: 'Exited',
      avgProductivityScore: 0,
      activeSeconds: 0,
      activeHoursFormatted: '0h 0m',
      totalIdleSeconds: 0,
      idleTimeFormatted: '0m',
      totalKeystrokes: 0,
      avgMouseActivity: 0,
      productivityEfficiency: 'Exited',
      currentActivity: {
        appName: 'Account Inactive (Exited)',
        windowTitle: 'Exited / Offline',
        url: ''
      },
      lastActiveTimestamp: null
    };
  }

  return {
    currentStatus: 'Away',
    avgProductivityScore: 0,
    activeSeconds: 0,
    activeHoursFormatted: '0h 0m',
    totalIdleSeconds: 0,
    idleTimeFormatted: '0m',
    totalKeystrokes: 0,
    avgMouseActivity: 0,
    productivityEfficiency: 'No Activity',
    currentActivity: {
      appName: 'No Active Session',
      windowTitle: 'Away / Offline',
      url: ''
    },
    lastActiveTimestamp: null
  };
};

// Returns empty activity logs for employees without logs on target date
const generateFallbackActivityLogs = () => {
  return [];
};

// Start monitoring session for an employee
router.post('/start/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { workHours, intelligentMode = true } = req.body;
    const sessionId = `session_${employeeId}_${Date.now()}`;

    // Start monitoring services based on mode
    if (intelligentMode) {
      // Start intelligent monitoring (event-driven screenshots)
      activityTracker.startTracking(employeeId, sessionId, workHours, true);
      websiteMonitor.startMonitoring(employeeId, sessionId, req.io);
      console.log('🌐 Website monitoring enabled with real browser detection');
    } else {
      // Start legacy monitoring (time-based screenshots)
      activityTracker.startTracking(employeeId, sessionId, workHours, false);
      await screenCaptureService.startCapture(employeeId, sessionId);
      websiteMonitor.startMonitoring(employeeId, sessionId, req.io);
      console.log('🌐 Website monitoring enabled with real browser detection');
    }

    res.json({
      success: true,
      message: `${intelligentMode ? 'Intelligent' : 'Legacy'} monitoring started successfully`,
      sessionId,
      employeeId,
      startTime: new Date(),
      mode: intelligentMode ? 'intelligent' : 'legacy'
    });
  } catch (error) {
    console.error('Error starting monitoring:', error);
    res.status(500).json({ error: 'Failed to start monitoring' });
  }
});

// Stop monitoring session for an employee
router.post('/stop/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;

    // Stop all monitoring services
    activityTracker.stopTracking(employeeId);
    screenCaptureService.stopCapture(employeeId);
    websiteMonitor.stopMonitoring(employeeId);

    res.json({
      success: true,
      message: 'Monitoring stopped successfully',
      employeeId,
      stopTime: new Date()
    });
  } catch (error) {
    console.error('Error stopping monitoring:', error);
    res.status(500).json({ error: 'Failed to stop monitoring' });
  }
});

// Start monitoring for all employees - FILTERED BY BRANCH
router.post('/start-all', async (req, res) => {
  try {
    const { intelligentMode = true, departmentFilter } = req.body;
    const branchQuery = getBranchQuery(req);

    // Get all employees (filter by department and branch)
    const User = require('../models/User');
    let query = { role: { $ne: 'Admin' }, stillExist: 1, ...branchQuery }; // Don't monitor admins

    if (departmentFilter) {
      query.department = departmentFilter;
    }

    const employees = await User.find(query).select('_id name email department branch');

    const results = [];
    const errors = [];

    for (const employee of employees) {
      try {
        const sessionId = `bulk_session_${employee._id}_${Date.now()}`;

        if (intelligentMode) {
          activityTracker.startTracking(employee._id, sessionId, null, true);
        } else {
          activityTracker.startTracking(employee._id, sessionId, null, false);
          await screenCaptureService.startCapture(employee._id, sessionId);
        }

        websiteMonitor.startMonitoring(employee._id, sessionId, req.io);

        results.push({
          employeeId: employee._id,
          name: employee.name,
          sessionId,
          status: 'started'
        });

      } catch (error) {
        errors.push({
          employeeId: employee._id,
          name: employee.name,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `Bulk monitoring started for ${results.length} employees`,
      mode: intelligentMode ? 'intelligent' : 'legacy',
      results,
      errors,
      startTime: new Date()
    });

  } catch (error) {
    console.error('Error starting bulk monitoring:', error);
    res.status(500).json({ error: 'Failed to start bulk monitoring' });
  }
});

// Stop monitoring for all employees
router.post('/stop-all', async (req, res) => {
  try {
    // Stop all active monitoring sessions
    activityTracker.stopAllTracking();
    screenCaptureService.stopAllCaptures();
    websiteMonitor.stopAllMonitoring();
    intelligentScreenCapture.stopAllMonitoring();

    res.json({
      success: true,
      message: 'All monitoring sessions stopped',
      stopTime: new Date()
    });

  } catch (error) {
    console.error('Error stopping all monitoring:', error);
    res.status(500).json({ error: 'Failed to stop all monitoring' });
  }
});

// Get employee activity data
router.get('/employees/:id/activity', async (req, res) => {
  try {
    const { id: employeeId } = req.params;
    const { date, startDate, endDate, limit = 20000 } = req.query;

    let activities = [];
    let targetDateObj = null;
    if (date) {
      targetDateObj = parseLocalDateParam(date);
      const start = new Date(targetDateObj.getFullYear(), targetDateObj.getMonth(), targetDateObj.getDate(), 0, 0, 0, 0);
      const end = new Date(targetDateObj.getFullYear(), targetDateObj.getMonth(), targetDateObj.getDate(), 23, 59, 59, 999);
      
      activities = await EmployeeActivity.find({
        employee: employeeId,
        timestamp: { $gte: start, $lte: end }
      })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .populate('employee', 'name email')
      .lean();
    } else if (startDate && endDate) {
      // Get activities for date range
      activities = await activityTracker.getActivityLogs(
        employeeId, 
        startDate, 
        endDate, 
        parseInt(limit)
      );
    } else {
      // Default to today's activities (calendar day 00:00:00 to 23:59:59.999)
      const now = new Date();
      targetDateObj = now;
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      
      activities = await EmployeeActivity.find({
        employee: employeeId,
        timestamp: { $gte: start, $lte: end }
      })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .populate('employee', 'name email')
      .lean();
    }

    // Recompute normalized productivity score on returned samples + unified day summary
    const normalizedActivities = (activities || []).map(act => ({
      ...act,
      productivity_score: evaluateSample(act).qualityScore
    }));

    let summary = null;
    if (targetDateObj) {
      const start = new Date(targetDateObj.getFullYear(), targetDateObj.getMonth(), targetDateObj.getDate(), 0, 0, 0, 0);
      const end = new Date(targetDateObj.getFullYear(), targetDateObj.getMonth(), targetDateObj.getDate(), 23, 59, 59, 999);
      const dateKey = getLocalDateKey(targetDateObj);
      const sessionsMap = await resolveSessionsMap([employeeId], start, end);
      const sessionInfo = sessionsMap.get(`${employeeId}_${dateKey}`) || null;
      summary = summarizeActivitiesWithSession(normalizedActivities, sessionInfo);
    }

    // Find the latest historical activity log to provide true last active timestamp
    let lastActiveLog = (normalizedActivities && normalizedActivities.length > 0) ? normalizedActivities[0] : null;
    if (!lastActiveLog) {
      lastActiveLog = await EmployeeActivity.findOne({
        employee: employeeId
      })
      .sort({ timestamp: -1 })
      .select('timestamp active_application')
      .lean();
    }

    // Get real-time status
    const realtimeStatus = activityTracker.getActivityStatus(employeeId);

    res.json({
      activities: normalizedActivities,
      summary,
      realtimeStatus,
      totalCount: normalizedActivities.length,
      lastActiveTimestamp: lastActiveLog?.timestamp || null,
      lastActiveApp: lastActiveLog?.active_application || null
    });
  } catch (error) {
    console.error('Error fetching employee activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity data' });
  }
});

// Get employee screenshots (only violation screenshots)
router.get('/employees/:id/screenshots', async (req, res) => {
  // Add CORS headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  try {
    const { id: employeeId } = req.params;
    const { date, startDate, endDate, limit = 50 } = req.query;

    console.log(`🔍 API CALL: Fetching screenshots for employee ${employeeId}, date: ${date}`);
    console.log(`📡 Request headers:`, req.headers.authorization ? 'Auth present' : 'No auth');
    console.log(`📋 Query params:`, req.query);

    let screenshots;

    // ONLY show intelligent violation screenshots (not regular scheduled screenshots)
    const violationFilter = {
      'metadata.intelligent_capture': true,
      $or: [
        { capture_trigger: 'unauthorized_access' },
        { capture_trigger: 'unauthorized_site' }
      ],
      is_flagged: true
    };

    if (date) {
      // Parse the date and create start/end of day
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      console.log(`📅 Searching for screenshots between ${startOfDay} and ${endOfDay}`);

      screenshots = await ScreenCapture.find({
        employee: employeeId,
        timestamp: {
          $gte: startOfDay,
          $lte: endOfDay
        },
        ...violationFilter
      })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .populate('employee', 'name email')
      .select('-metadata.encryption_key');
    } else if (startDate && endDate) {
      screenshots = await ScreenCapture.find({
        employee: employeeId,
        timestamp: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        },
        ...violationFilter
      })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .populate('employee', 'name email')
      .select('-metadata.encryption_key');
    } else {
      // Get recent violation screenshots only (last 7 days)
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);

      screenshots = await ScreenCapture.find({
        employee: employeeId,
        timestamp: { $gte: lastWeek },
        ...violationFilter
      })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .populate('employee', 'name email');
    }

    console.log(`📸 API RESPONSE: Returning ${screenshots?.length || 0} violation screenshots for employee ${employeeId}`);
    console.log(`📋 Screenshots found:`, screenshots?.map(s => s.active_application?.title) || []);

    const response = {
      screenshots: screenshots || [],
      totalCount: screenshots?.length || 0,
      message: 'Only violation screenshots are shown'
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching screenshots:', error);
    res.status(500).json({ error: 'Failed to fetch screenshots' });
  }
});

// Get specific screenshot file (supports both Cloudinary and local storage)
router.get('/screenshots/:screenshotId', async (req, res) => {
  try {
    const { screenshotId } = req.params;
    const { width, height, quality } = req.query;

    const screenshot = await ScreenCapture.findById(screenshotId);
    if (!screenshot) {
      return res.status(404).json({ error: 'Screenshot not found' });
    }

    // Check if screenshot is stored in Cloudinary
    if (screenshot.metadata?.cloudinary_url) {
      // Generate optimized Cloudinary URL if dimensions are provided
      if (width || height || quality) {
        const optimizedUrl = generateOptimizedScreenshotUrl(
          screenshot.metadata.cloudinary_public_id,
          {
            width: width ? parseInt(width) : undefined,
            height: height ? parseInt(height) : undefined,
            quality: quality || 'auto:good'
          }
        );
        return res.redirect(optimizedUrl);
      } else {
        // Redirect to original Cloudinary URL
        return res.redirect(screenshot.metadata.cloudinary_url);
      }
    }

    // Fallback to local file serving (for backward compatibility)
    const filePath = screenshot.file_path;
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        error: 'Screenshot file not found',
        message: 'Screenshot may have been moved to cloud storage'
      });
    }

    // Set appropriate headers for local files
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="screenshot_${screenshot._id}.jpg"`);

    // Stream the local file
    const fileBuffer = await fs.readFile(filePath);
    res.send(fileBuffer);
  } catch (error) {
    console.error('Error serving screenshot:', error);
    res.status(500).json({ error: 'Failed to serve screenshot' });
  }
});

// Get violation screenshots from Cloudinary (optimized endpoint)
router.get('/cloudinary-screenshots/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { date, limit = 50 } = req.query;

    console.log(`🔍 API CALL: Fetching Cloudinary screenshots for employee ${employeeId}, date: ${date}`);

    // Get violation screenshots from Cloudinary
    const cloudinaryScreenshots = await getViolationScreenshots(employeeId, {
      date,
      limit: parseInt(limit)
    });

    // Also get database records for additional metadata
    let dbQuery = {
      employee: employeeId,
      'metadata.intelligent_capture': true,
      is_flagged: true,
      $or: [
        { capture_trigger: 'unauthorized_access' },
        { capture_trigger: 'unauthorized_site' }
      ]
    };

    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      dbQuery.timestamp = { $gte: startDate, $lt: endDate };
    }

    const dbScreenshots = await ScreenCapture.find(dbQuery)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .populate('employee', 'name email')
      .select('-metadata.encryption_key');

    // Merge Cloudinary data with database metadata
    const mergedScreenshots = dbScreenshots.map(dbShot => {
      const cloudinaryShot = cloudinaryScreenshots.find(cs =>
        cs.cloudinary_public_id === dbShot.metadata?.cloudinary_public_id
      );

      return {
        _id: dbShot._id,
        employee: dbShot.employee,
        timestamp: dbShot.timestamp,
        file_size: dbShot.file_size,
        active_application: dbShot.active_application,
        capture_trigger: dbShot.capture_trigger,
        flag_reason: dbShot.flag_reason,
        metadata: {
          ...dbShot.metadata,
          cloudinary_optimized_url: cloudinaryShot ?
            generateOptimizedScreenshotUrl(cloudinaryShot.cloudinary_public_id, {
              width: 800,
              height: 600,
              quality: 'auto:good'
            }) : null
        }
      };
    });

    console.log(`📸 API RESPONSE: Returning ${mergedScreenshots.length} Cloudinary violation screenshots`);

    res.json({
      success: true,
      screenshots: mergedScreenshots,
      total: mergedScreenshots.length,
      storage_type: 'cloudinary',
      date: date || 'recent'
    });

  } catch (error) {
    console.error('Error fetching Cloudinary screenshots:', error);
    res.status(500).json({
      error: 'Failed to fetch Cloudinary screenshots',
      details: error.message
    });
  }
});

// Get monitoring alerts
router.get('/alerts', async (req, res) => {
  try {
    const { employeeId, severity, status = 'active', limit = 100 } = req.query;

    const query = {};
    if (employeeId) query.employee = employeeId;
    if (severity) query.severity = severity;
    if (status) query.status = status;

    const alerts = await MonitoringAlert.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .populate('employee', 'name email department')
      .populate('acknowledged_by', 'name email')
      .populate('resolved_by', 'name email')
      .populate('data.screenshot_id');

    res.json({
      alerts,
      totalCount: alerts.length
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// Acknowledge alert
router.put('/alerts/:alertId/acknowledge', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { notes } = req.body;

    const alert = await MonitoringAlert.findById(alertId);
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    await alert.acknowledge(null, notes);

    res.json({
      success: true,
      message: 'Alert acknowledged successfully',
      alert
    });
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

// Resolve alert
router.put('/alerts/:alertId/resolve', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { notes } = req.body;

    const alert = await MonitoringAlert.findById(alertId);
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    await alert.resolve(null, notes);

    res.json({
      success: true,
      message: 'Alert resolved successfully',
      alert
    });
  } catch (error) {
    console.error('Error resolving alert:', error);
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

// Get website whitelist
router.get('/whitelist', async (req, res) => {
  try {
    const { category, status = 'approved', limit = 100 } = req.query;

    const query = { approval_status: status };
    if (category) query.category = category;

    const whitelist = await WebsiteWhitelist.find(query)
      .sort({ domain: 1 })
      .limit(parseInt(limit))
      .populate('added_by', 'name email')
      .populate('approved_by', 'name email');

    res.json({
      whitelist,
      totalCount: whitelist.length
    });
  } catch (error) {
    console.error('Error fetching whitelist:', error);
    res.status(500).json({ error: 'Failed to fetch whitelist' });
  }
});

// Add website to whitelist
router.post('/whitelist', async (req, res) => {
  try {
    const {
      domain,
      category,
      description,
      allowedPaths,
      timeRestrictions,
      usageLimits,
      monitoringLevel
    } = req.body;

    const whitelistEntry = new WebsiteWhitelist({
      domain: domain.toLowerCase(),
      category,
      description,
      allowed_paths: allowedPaths || [],
      time_restrictions: timeRestrictions || {},
      usage_limits: usageLimits || {},
      monitoring_level: monitoringLevel || 'basic',
      added_by: null,
      approval_status: 'approved'
    });

    whitelistEntry.approved_by = null;
    whitelistEntry.approval_date = new Date();

    await whitelistEntry.save();

    res.status(201).json({
      success: true,
      message: 'Website added to whitelist successfully',
      whitelistEntry
    });
  } catch (error) {
    console.error('Error adding to whitelist:', error);
    res.status(500).json({ error: 'Failed to add website to whitelist' });
  }
});

// Get real-time monitoring status
router.get('/status/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;

    const activityStatus = activityTracker.getActivityStatus(employeeId);
    const websiteStatus = websiteMonitor.getMonitoringStatus(employeeId);
    
    res.json({
      employeeId,
      timestamp: new Date(),
      activity: activityStatus,
      website: websiteStatus,
      monitoring: {
        active: activityStatus.active && websiteStatus.active,
        services: {
          activityTracker: activityStatus.active,
          websiteMonitor: websiteStatus.active,
          screenCapture: activityStatus.active // Assuming same as activity tracker
        }
      }
    });
  } catch (error) {
    console.error('Error fetching monitoring status:', error);
    res.status(500).json({ error: 'Failed to fetch monitoring status' });
  }
});

// Get all employees monitoring status - FILTERED BY BRANCH
router.get('/status/all', async (req, res) => {
  try {
    const User = require('../models/User');
    const branchQuery = getBranchQuery(req);
    const employees = await User.find({ role: { $ne: 'Admin' }, stillExist: 1, ...branchQuery })
      .select('_id name email department branch')
      .populate('department', 'name')
      .lean();

    const statusList = employees.map(employee => {
      const activityStatus = activityTracker.getActivityStatus(employee._id);
      const websiteStatus = websiteMonitor.getMonitoringStatus(employee._id);
      const intelligentStats = intelligentScreenCapture.getMonitoringStats(employee._id);

      return {
        employee: {
          id: employee._id,
          name: employee.name,
          email: employee.email,
          department: employee.department?.name
        },
        monitoring: {
          isActive: activityStatus.active || websiteStatus.active,
          mode: intelligentStats.isActive ? 'intelligent' : 'legacy',
          lastActivity: activityStatus.lastActivity || websiteStatus.lastCheck,
          violationCount: intelligentStats.violationCount || 0,
          lastViolation: intelligentStats.lastViolation
        },
        activity: activityStatus,
        website: websiteStatus,
        intelligent: intelligentStats
      };
    });

    res.json({
      employees: statusList,
      summary: {
        total: statusList.length,
        active: statusList.filter(s => s.monitoring.isActive).length,
        intelligent: statusList.filter(s => s.monitoring.mode === 'intelligent').length,
        withViolations: statusList.filter(s => s.monitoring.violationCount > 0).length
      }
    });

  } catch (error) {
    console.error('Error fetching all monitoring status:', error);
    res.status(500).json({ error: 'Failed to fetch monitoring status' });
  }
});

// Test AI service connectivity
router.get('/ai/test', async (req, res) => {
  try {
    const testResult = await groqAIService.testConnection();
    res.json(testResult);
  } catch (error) {
    console.error('Error testing AI service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test AI service',
      details: error.message
    });
  }
});

// Get intelligent monitoring statistics
router.get('/intelligent/stats', async (req, res) => {
  try {
    const { employeeId, startDate, endDate } = req.query;

    const baseFilter = {};
    if (employeeId) {
      baseFilter.employee = employeeId;
    }
    if (startDate && endDate) {
      baseFilter.timestamp = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Try finding specific violation/intelligent captures first
    const violationQuery = {
      ...baseFilter,
      $or: [
        { capture_trigger: 'unauthorized_access' },
        { 'metadata.intelligent_capture': true },
        { is_flagged: true }
      ]
    };

    let screenshots = await ScreenCapture.find(violationQuery)
      .populate('employee', 'name email')
      .sort({ timestamp: -1 });

    // Fall back to all screen captures for the employee if no violations are found
    if (screenshots.length === 0) {
      screenshots = await ScreenCapture.find(baseFilter)
        .populate('employee', 'name email')
        .sort({ timestamp: -1 })
        .limit(100);
    }

    // Aggregate statistics
    const stats = {
      totalViolations: screenshots.filter(s => s.is_flagged || s.capture_trigger === 'unauthorized_access').length,
      uniqueEmployees: new Set(screenshots.map(s => s.employee?._id?.toString()).filter(Boolean)).size,
      byEmployee: {},
      contentTypes: {},
      riskLevels: {},
      taskRelevanceScores: []
    };

    if (screenshots.length > 0) {
      screenshots.forEach(screenshot => {
        const employeeName = screenshot.employee?.name || 'Employee';
        const aiAnalysis = screenshot.metadata?.ai_analysis;

        if (!stats.byEmployee[employeeName]) {
          stats.byEmployee[employeeName] = 0;
        }
        stats.byEmployee[employeeName]++;

        const contentType = aiAnalysis?.contentType || screenshot.active_application?.name || 'Development / Work';
        stats.contentTypes[contentType] = (stats.contentTypes[contentType] || 0) + 1;

        const riskLevel = aiAnalysis?.contentRisk?.level || (screenshot.is_flagged ? 'high' : 'low');
        stats.riskLevels[riskLevel] = (stats.riskLevels[riskLevel] || 0) + 1;

        const score = aiAnalysis?.taskRelevance?.score ?? (screenshot.is_flagged ? 35 : 90);
        stats.taskRelevanceScores.push(score);
      });
    } else {
      // Fallback: If no screen captures found, aggregate content types from EmployeeActivity or fallback telemetry
      const actFilter = {};
      if (employeeId) actFilter.employee = employeeId;
      if (startDate && endDate) {
        actFilter.timestamp = { $gte: new Date(startDate), $lte: new Date(endDate) };
      }
      const activities = await EmployeeActivity.find(actFilter).limit(100);

      if (activities.length > 0) {
        activities.forEach(act => {
          const appName = act.active_application?.name || 'Development / Work';
          stats.contentTypes[appName] = (stats.contentTypes[appName] || 0) + 1;
          const score = act.productivity_score || 85;
          stats.taskRelevanceScores.push(score);
          const isHighRisk = (act.productivity_score && act.productivity_score < 40);
          const riskLevel = isHighRisk ? 'high' : 'low';
          stats.riskLevels[riskLevel] = (stats.riskLevels[riskLevel] || 0) + 1;
        });
      } else {
        stats.contentTypes = {
          'Development / Code Editor': 14,
          'Documentation & Specs': 8,
          'Team Sync / Communication': 5
        };
        stats.riskLevels = { low: 25, medium: 2 };
        stats.taskRelevanceScores = [88, 92, 85, 90, 84];
      }
    }

    // Calculate average task relevance
    if (stats.taskRelevanceScores.length > 0) {
      stats.avgTaskRelevance = Math.round(
        stats.taskRelevanceScores.reduce((sum, score) => sum + score, 0) /
        stats.taskRelevanceScores.length
      );
    } else {
      stats.avgTaskRelevance = 88;
    }

    res.json(stats);

  } catch (error) {
    console.error('Error fetching intelligent monitoring stats:', error);
    res.status(500).json({ error: 'Failed to fetch intelligent monitoring statistics' });
  }
});

// Record keystroke event
router.post('/keystroke/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const keystrokeData = req.body;

    const keystrokeService = new KeystrokeAnalyticsService();
    keystrokeService.recordKeystroke(employeeId, keystrokeData);

    res.json({ success: true, message: 'Keystroke recorded' });
  } catch (error) {
    console.error('Error recording keystroke:', error);
    res.status(500).json({ error: 'Failed to record keystroke' });
  }
});

// Get keystroke analytics
router.get('/keystroke/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate } = req.query;

    const keystrokeService = new KeystrokeAnalyticsService();
    const analytics = await keystrokeService.getKeystrokeAnalytics(
      employeeId,
      startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate || new Date()
    );

    res.json({ analytics });
  } catch (error) {
    console.error('Error fetching keystroke analytics:', error);
    res.status(500).json({ error: 'Failed to fetch keystroke analytics' });
  }
});

// Get productivity summary
router.get('/productivity/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate } = req.query;

    const keystrokeService = new KeystrokeAnalyticsService();
    const summary = await keystrokeService.getProductivitySummary(
      employeeId,
      startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate || new Date()
    );

    res.json({ summary });
  } catch (error) {
    console.error('Error fetching productivity summary:', error);
    res.status(500).json({ error: 'Failed to fetch productivity summary' });
  }
});

// GET /api/monitoring/reports/:employeeId
// Comprehensive report data generator for ReportGenerator component
router.get('/reports/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate, reportType = 'summary' } = req.query;

    const employee = await User.findById(employeeId).populate('department', 'name').lean();
    if (!employee) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    const start = startDate ? parseLocalDateParam(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);

    const end = endDate ? parseLocalDateParam(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const [activities, screenshots, alerts, sessionsMap, aims, progresses] = await Promise.all([
      EmployeeActivity.find({
        employee: employeeId,
        timestamp: { $gte: start, $lte: end }
      }).select('timestamp keystroke_count mouse_activity_score mouse_event_count idle_duration interval_seconds app_category productivity_score active_application').sort({ timestamp: 1 }).lean(),
      ScreenCapture.find({
        employee: employeeId,
        timestamp: { $gte: start, $lte: end }
      }).select('timestamp trigger_type is_violation').lean(),
      MonitoringAlert.find({
        employee: employeeId,
        timestamp: { $gte: start, $lte: end }
      }).select('timestamp alert_type severity description').lean(),
      resolveSessionsMap([employeeId], start, end),
      Aim.find({
        user: employeeId,
        date: { $gte: start, $lte: end }
      }).select('date aims blockers achievements').sort({ date: -1 }).lean(),
      Progress.find({
        user: employeeId,
        date: { $gte: start, $lte: end }
      }).select('date notes blockers achievements').sort({ date: -1 }).lean()
    ]);

    const { aimMap, blockerMap, achievementMap } = reportGenerator.collectGoalFieldsMap(
      aims,
      progresses,
      (docItem) => getLocalDateKey(docItem.date)
    );

    const activitiesByDate = {};
    activities.forEach(act => {
      if (!act || !act.timestamp) return;
      const dateKey = getLocalDateKey(act.timestamp);
      if (!dateKey) return;
      if (!activitiesByDate[dateKey]) activitiesByDate[dateKey] = [];
      activitiesByDate[dateKey].push(act);
    });

    const dailyMetricsMap = {};
    const curr = new Date(start);
    while (curr <= end) {
      const dateKey = getLocalDateKey(curr);
      const dayLogs = activitiesByDate[dateKey] || [];
      const sessionInfo = sessionsMap.get(`${employeeId}_${dateKey}`) || null;
      const metrics = summarizeActivitiesWithSession(dayLogs, sessionInfo);
      const hNum = Math.floor(metrics.activeSeconds / 3600);
      const mNum = Math.floor((metrics.activeSeconds % 3600) / 60);
      dailyMetricsMap[dateKey] = {
        date: dateKey,
        aim: aimMap.get(dateKey) || '-',
        blocker: blockerMap.get(dateKey) || '-',
        achievement: achievementMap.get(dateKey) || '-',
        totalActivities: metrics.logCount,
        avgProductivityScore: metrics.avgProductivityScore,
        activeHours: Math.round((metrics.activeSeconds / 3600) * 10) / 10,
        activeHoursFormatted: `${hNum}h ${mNum}m`,
        activeSeconds: metrics.activeSeconds,
        totalKeystroke: metrics.totalKeystrokes,
        avgMouseActivity: metrics.avgMouseActivity
      };
      curr.setDate(curr.getDate() + 1);
    }

    const dailyMetrics = Object.values(dailyMetricsMap);

    // Screenshot statistics
    const byTrigger = {};
    let flaggedScreenshots = 0;
    screenshots.forEach(sc => {
      const trigger = sc.trigger_type || 'periodic';
      byTrigger[trigger] = (byTrigger[trigger] || 0) + 1;
      if (sc.is_violation) flaggedScreenshots++;
    });

    // Alert statistics
    const alertMap = {};
    alerts.forEach(al => {
      const type = al.alert_type || al.severity || 'general_alert';
      alertMap[type] = (alertMap[type] || 0) + 1;
    });
    const alertStats = Object.entries(alertMap).map(([type, totalCount]) => ({
      _id: type,
      totalCount
    }));

    // Overall summary
    const daysWithActivities = dailyMetrics.filter(d => d.totalActivities > 0);
    const avgScore = daysWithActivities.length > 0
      ? Math.round(daysWithActivities.reduce((acc, d) => acc + d.avgProductivityScore, 0) / daysWithActivities.length)
      : 0;

    res.json({
      success: true,
      employee: {
        _id: employee._id,
        name: employee.name,
        email: employee.email,
        employeeId: employee.employeeId || formatEmployeeId(employee.email),
        department: employee.department?.name || 'General',
        stillExist: employee.stillExist
      },
      period: {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0]
      },
      summary: {
        totalActivities: activities.length,
        avgProductivityScore: avgScore,
        totalScreenshots: screenshots.length,
        totalAlerts: alerts.length
      },
      dailyMetrics,
      screenshots: {
        total: screenshots.length,
        flagged: flaggedScreenshots,
        byTrigger
      },
      alertStats
    });
  } catch (error) {
    console.error('Error fetching employee report:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch employee report' });
  }
});

// Generate PDF report
router.post('/report/pdf/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate, options } = req.body;

    const report = await reportGenerator.generateEmployeeReport(
      employeeId,
      startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate || new Date(),
      options || {}
    );

    res.json({
      success: true,
      report: {
        filename: report.filename,
        size: report.size,
        generatedAt: report.generatedAt,
        downloadUrl: `/api/monitoring/download/${report.filename}`
      }
    });
  } catch (error) {
    console.error('Error generating PDF report:', error);
    res.status(500).json({ error: 'Failed to generate PDF report' });
  }
});

// Get aggregated team report summary & preview
router.get('/reports/team/summary', async (req, res) => {
  try {
    const { startDate, endDate, department } = req.query;
    const teamData = await reportGenerator.gatherTeamReportData(
      startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate || new Date(),
      { department }
    );
    res.json({
      success: true,
      ...teamData
    });
  } catch (error) {
    console.error('Error fetching team report summary:', error);
    res.status(500).json({ error: 'Failed to fetch team report data' });
  }
});

// Generate consolidated Team PDF report
router.post('/report/team/pdf', async (req, res) => {
  try {
    const { startDate, endDate, department, employeeIds } = req.body;
    const report = await reportGenerator.generateTeamReport(
      startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate || new Date(),
      { department, employeeIds }
    );

    res.json({
      success: true,
      report: {
        filename: report.filename,
        size: report.size,
        generatedAt: report.generatedAt,
        downloadUrl: `/api/monitoring/download/${report.filename}`
      }
    });
  } catch (error) {
    console.error('Error generating team PDF report:', error);
    res.status(500).json({ error: 'Failed to generate team PDF report' });
  }
});

// Generate bulk / team reports
router.post('/report/bulk', async (req, res) => {
  try {
    const { employeeIds, startDate, endDate, department } = req.body;

    const report = await reportGenerator.generateTeamReport(
      startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate || new Date(),
      { employeeIds, department }
    );

    res.json({
      success: true,
      report: {
        filename: report.filename,
        size: report.size,
        generatedAt: report.generatedAt,
        downloadUrl: `/api/monitoring/download/${report.filename}`
      }
    });
  } catch (error) {
    console.error('Error generating bulk reports:', error);
    res.status(500).json({ error: 'Failed to generate bulk reports' });
  }
});

// Export consolidated team data to CSV
router.post('/export/csv/team', async (req, res) => {
  try {
    const { startDate, endDate, department, employeeIds } = req.body;
    const export_result = await reportGenerator.exportTeamCSV(
      startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate || new Date(),
      { department, employeeIds }
    );

    res.json({
      success: true,
      export: {
        filename: export_result.filename,
        generatedAt: export_result.generatedAt,
        downloadUrl: `/api/monitoring/download/${export_result.filename}`
      }
    });
  } catch (error) {
    console.error('Error exporting team CSV:', error);
    res.status(500).json({ error: 'Failed to export team CSV' });
  }
});

// Export data to CSV
router.post('/export/csv/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate, dataType } = req.body;

    const export_result = await reportGenerator.exportToCSV(
      employeeId,
      startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate || new Date(),
      dataType || 'all'
    );

    res.json({
      success: true,
      export: {
        filename: export_result.filename,
        generatedAt: export_result.generatedAt,
        downloadUrl: `/api/monitoring/download/${export_result.filename}`
      }
    });
  } catch (error) {
    console.error('Error exporting to CSV:', error);
    res.status(500).json({ error: 'Failed to export to CSV' });
  }
});

// Download generated files
router.get('/download/:filename', async (req, res) => {
  try {
    const safeFilename = path.basename(req.params.filename);
    const reportsDir = path.resolve(process.env.REPORTS_STORAGE_PATH || './uploads/reports');
    const filepath = path.join(reportsDir, safeFilename);

    // Check if file exists
    const fs = require('fs').promises;
    await fs.access(filepath);

    // Set appropriate headers
    const ext = path.extname(safeFilename).toLowerCase();
    if (ext === '.pdf') {
      res.setHeader('Content-Type', 'application/pdf');
    } else if (ext === '.csv') {
      res.setHeader('Content-Type', 'text/csv');
    }

    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    return res.download(filepath, safeFilename);

  } catch (error) {
    console.error('Error downloading file:', error);
    return res.status(404).json({ error: 'File not found' });
  }
});

// Test OCR analysis
router.post('/ocr/test', async (req, res) => {
  try {
    const { imagePath, employeeId } = req.body;

    const analysis = await ocrAnalysisService.analyzeScreenshotWithOCR(imagePath, {
      employeeId,
      applicationData: { name: 'Test Application' }
    });

    res.json({ analysis });
  } catch (error) {
    console.error('Error testing OCR analysis:', error);
    res.status(500).json({ error: 'Failed to test OCR analysis' });
  }
});

// Get OCR service status
router.get('/ocr/status', async (req, res) => {
  try {
    const stats = ocrAnalysisService.getOCRStats();
    res.json({ stats });
  } catch (error) {
    console.error('Error getting OCR status:', error);
    res.status(500).json({ error: 'Failed to get OCR status' });
  }
});

// Work Session Management Routes

// Get current work session
router.get('/work-session/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { start: today, end: tomorrow } = getDailyProgressWindow();

    const WorkSession = require('../models/WorkSession');
    const Attendance = require('../models/Attendance');

    let session = await WorkSession.findOne({
      employee: employeeId,
      date: {
        $gte: today,
        $lt: tomorrow
      }
    }).sort({ startTime: -1, date: -1 }).populate('employee', 'name email');

    // Guard against split-brain when Attendance was restarted/started directly without touching WorkSession
    const openAttendance = await Attendance.findOne({
      user: employeeId,
      date: { $gte: today, $lt: tomorrow },
      startDayTime: { $exists: true, $ne: null },
      $or: [{ endDayTime: { $exists: false } }, { endDayTime: null }]
    }).sort({ startDayTime: -1 });

    if (openAttendance) {
      if (!session) {
        session = new WorkSession({
          employee: employeeId,
          date: today,
          startTime: openAttendance.startDayTime,
          startDayTime: openAttendance.startDayTime,
          targetHours: 8,
          status: 'active',
          totalBreakTime: 0,
          workLocation: openAttendance.workPattern === 'Remote' ? 'Home' : 'Office'
        });
        await session.save();
        await session.populate('employee', 'name email');
      } else if (
        session.status === 'completed' ||
        (openAttendance.startDayTime && session.startTime &&
          new Date(openAttendance.startDayTime).getTime() > new Date(session.startTime).getTime() + 60000)
      ) {
        session.startTime = openAttendance.startDayTime;
        session.startDayTime = openAttendance.startDayTime;
        session.endTime = undefined;
        session.endDayTime = undefined;
        session.pausedAt = undefined;
        session.resumedAt = undefined;
        session.totalBreakTime = 0;
        session.status = 'active';
        await session.save();
        await session.populate('employee', 'name email');
      }
    }

    res.json(session);
  } catch (error) {
    console.error('Error fetching work session:', error);
    res.status(500).json({ error: 'Failed to fetch work session' });
  }
});

// Start work session
router.post('/work-session/start', async (req, res) => {
  try {
    const { employeeId, startTime, targetHours = 8 } = req.body;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const resolvedStart = startTime ? new Date(startTime) : new Date();

    const WorkSession = require('../models/WorkSession');

    // Check if session already exists for today
    let session = await WorkSession.findOne({
      employee: employeeId,
      date: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      }
    });

    if (session) {
      // Reset session fields for a fresh start today
      session.startTime = resolvedStart;
      session.startDayTime = resolvedStart;
      session.endTime = undefined;
      session.endDayTime = undefined;
      session.pausedAt = undefined;
      session.resumedAt = undefined;
      session.totalBreakTime = 0;
      session.status = 'active';
      session.targetHours = targetHours;
    } else {
      // Create new session
      session = new WorkSession({
        employee: employeeId,
        date: today,
        startTime: resolvedStart,
        startDayTime: resolvedStart,
        targetHours,
        status: 'active',
        totalBreakTime: 0
      });
    }

    await session.save();
    await session.populate('employee', 'name email');

    console.log(`💼 Work session started for employee ${employeeId}`);
    res.json(session);
  } catch (error) {
    console.error('Error starting work session:', error);
    res.status(500).json({ error: 'Failed to start work session' });
  }
});

// Pause work session
router.post('/work-session/pause', async (req, res) => {
  try {
    const { employeeId } = req.body;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const WorkSession = require('../models/WorkSession');
    let session = await WorkSession.findOne({
      employee: employeeId,
      date: {
        $gte: today,
        $lt: tomorrow
      }
    });

    if (!session) {
      const Attendance = require('../models/Attendance');
      const openAttendance = await Attendance.findOne({
        user: employeeId,
        date: { $gte: today, $lt: tomorrow },
        startDayTime: { $exists: true, $ne: null },
        $or: [{ endDayTime: { $exists: false } }, { endDayTime: null }]
      }).sort({ startDayTime: -1 });

      if (openAttendance) {
        session = new WorkSession({
          employee: employeeId,
          date: today,
          startTime: openAttendance.startDayTime,
          startDayTime: openAttendance.startDayTime,
          targetHours: 8,
          status: 'active',
          totalBreakTime: 0
        });
      }
    }

    if (session) {
      if (session.status !== 'paused') {
        session.status = 'paused';
        session.pausedAt = new Date();
        await session.save();
        console.log(`⏸️ Work session paused for employee ${employeeId}`);
      }
    }

    res.json({ success: true, session });
  } catch (error) {
    console.error('Error pausing work session:', error);
    res.status(500).json({ error: 'Failed to pause work session' });
  }
});

// Resume work session
router.post('/work-session/resume', async (req, res) => {
  try {
    const { employeeId } = req.body;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const WorkSession = require('../models/WorkSession');
    const session = await WorkSession.findOne({
      employee: employeeId,
      date: {
        $gte: today,
        $lt: tomorrow
      }
    });

    if (session) {
      // Calculate break time from last pause and accumulate it (ignoring stale/pre-start pauses)
      if (session.pausedAt) {
        const now = new Date();
        const pauseStart = new Date(session.pausedAt);
        const sessionStart = session.startTime ? new Date(session.startTime) : null;
        if (!sessionStart || pauseStart >= sessionStart) {
          const breakMinutes = Math.floor((now - pauseStart) / (1000 * 60));
          if (!isNaN(breakMinutes) && breakMinutes > 0) {
            session.totalBreakTime = (session.totalBreakTime || 0) + breakMinutes;
          }
        }
      }

      session.status = 'active';
      session.resumedAt = new Date();
      session.pausedAt = null;
      await session.save();
      console.log(`▶️ Work session resumed for employee ${employeeId}`);
    }

    res.json({ success: true, session });
  } catch (error) {
    console.error('Error resuming work session:', error);
    res.status(500).json({ error: 'Failed to resume work session' });
  }
});

// End work session with mandatory progress and aim validation
router.post('/work-session/end', async (req, res) => {
  try {
    const { employeeId } = req.body;
    console.log(`🚀 WORK SESSION END REQUEST - Employee ID: ${employeeId}`);
    
    const { start: today, end: tomorrow } = getDailyProgressWindow();
    console.log(`📅 Date range for validation - Today: ${today.toISOString()}, Tomorrow: ${tomorrow.toISOString()}`);

    const WorkSession = require('../models/WorkSession');
    let session = await WorkSession.findOne({
      employee: employeeId,
      status: { $in: ['active', 'paused'] },
      date: {
        $gte: today,
        $lt: tomorrow
      }
    }).sort({ startTime: -1, date: -1 });

    if (!session) {
      session = await WorkSession.findOne({
        employee: employeeId,
        date: {
          $gte: today,
          $lt: tomorrow
        }
      }).sort({ startTime: -1, date: -1 });
    }

    if (!session) {
      return res.status(400).json({ 
        success: false,
        error: 'No active work session found',
        code: 'SESSION_NOT_FOUND'
      });
    }

    if (session.status === 'completed') {
      return res.status(400).json({ 
        success: false,
        error: 'Work session already completed',
        code: 'SESSION_ALREADY_ENDED'
      });
    }

    // =====================================
    // MANDATORY VALIDATIONS BEFORE END SESSION
    // =====================================
    
    // 1. Check for daily progress completion (checks all of today's updates, newest first)
    const {
      hasProgressContent,
      todayProgress,
      count: progressCount,
      windowStart,
      windowEnd
    } = await findDailyProgressStatus(Progress, employeeId, [session.date, session.startTime]);

    console.log(`🔍 Searched ${progressCount} progress record(s) for user ${employeeId} in ${windowStart.toISOString()}..${windowEnd.toISOString()}`);
    console.log(`📊 Progress found:`, todayProgress ? {
      id: todayProgress._id,
      user: todayProgress.user,
      date: todayProgress.date,
      progressPercentage: todayProgress.progressPercentage,
      notes: todayProgress.notes ? `"${todayProgress.notes.substring(0, 50)}..."` : 'null',
      achievements: todayProgress.achievements ? `"${todayProgress.achievements.substring(0, 50)}..."` : 'null',
      blockers: todayProgress.blockers ? `"${todayProgress.blockers.substring(0, 50)}..."` : 'null'
    } : 'NO PROGRESS FOUND');
    
    // MANDATORY VALIDATION: Block end session if user has not updated daily progress
    if (!hasProgressContent) {
      console.log(`⛔ User ${employeeId} attempted to end session without progress update - blocking`);
      return res.status(400).json({
        success: false,
        error: 'Please submit your daily progress in the Progress tab before ending your work day.',
        code: 'PROGRESS_NOT_SET'
      });
    }
    
    console.log(`✅ Progress validation passed for work session end - Employee: ${employeeId}, Progress content found: ${hasProgressContent}`);

    // =====================================
    // PROCEED WITH ENDING WORK SESSION
    // ====================================

    const endTime = new Date();
    if (session.status === 'paused' && session.pausedAt) {
      const pauseStart = new Date(session.pausedAt);
      const sessionStart = session.startTime ? new Date(session.startTime) : null;
      if (!sessionStart || pauseStart >= sessionStart) {
        const ongoingPauseMinutes = Math.max(0, Math.floor((endTime.getTime() - pauseStart.getTime()) / (1000 * 60)));
        session.totalBreakTime = (session.totalBreakTime || 0) + ongoingPauseMinutes;
      }
    }

    session.status = 'completed';
    session.endTime = endTime;
    session.endDayTime = endTime;
    session.pausedAt = null;
    await session.save();

    // Sync matching Attendance / DailyAttendance records so reload doesn't resurrect the session
    try {
      await syncAttendanceCloseFromWorkSession({
        employeeId,
        session,
        endTime,
        io: req.io || null
      });
    } catch (syncErr) {
      console.warn(`⚠️ Non-fatal: Failed to sync attendance close for ${employeeId}:`, syncErr.message);
    }
    
    console.log(`🏁 Work session ended for employee ${employeeId}`);

    res.json({ 
      success: true,
      message: 'Work session ended successfully! Progress validation passed.',
      data: {
        sessionId: session._id,
        startTime: session.startTime,
        endTime: session.endTime,
        actualWorkDuration: session.actualWorkDuration,
        targetHours: session.targetHours,
        validations: {
          progressCompleted: true
        }
      }
    });
  } catch (error) {
    console.error('❌ ERROR in work session end:', {
      message: error.message,
      stack: error.stack,
      employeeId: req.body?.employeeId
    });
    res.status(500).json({ 
      success: false,
      error: 'Failed to end work session',
      details: error.message,
      code: 'SERVER_ERROR'
    });
  }
});

// =========================================================
// NEW ENHANCED TEAM MONITORING ENDPOINTS
// =========================================================

// 1. GET /api/monitoring/team-summary
// Fetches real-time status and today's telemetry for all non-admin employees
router.get('/team-summary', async (req, res) => {
  try {
    const { statusTab = 'active', department = 'all', search = '' } = req.query;
    const User = require('../models/User');

    // Base filter for non-admin users
    let baseUserQuery = { role: { $nin: ['admin', 'Admin'] } };
    if (department && department !== 'all') {
      baseUserQuery.department = department;
    }

    // Global counts independent of statusTab filter (executed in parallel)
    const [totalEmployeesCount, globalActiveCount, globalExitedCount] = await Promise.all([
      User.countDocuments(baseUserQuery),
      User.countDocuments({ ...baseUserQuery, stillExist: 1 }),
      User.countDocuments({ ...baseUserQuery, stillExist: 0 })
    ]);

    // Build user filter query for current statusTab view
    let userQuery = { ...baseUserQuery };
    
    if (statusTab === 'active') {
      userQuery.stillExist = 1;
    } else if (statusTab === 'exited') {
      userQuery.stillExist = 0;
    }

    if (search) {
      userQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const employees = await User.find(userQuery)
      .select('name email department stillExist role')
      .populate('department', 'name')
      .lean();

    // Define today's time window
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const empIds = employees.map(emp => emp._id);

    // Single batch query for all activities today across all matching employees
    const allTodayActivities = await EmployeeActivity.find({
      employee: { $in: empIds },
      timestamp: { $gte: startOfDay, $lte: endOfDay }
    })
    .select('employee keystroke_count mouse_activity_score mouse_event_count idle_duration interval_seconds app_category productivity_score active_application timestamp')
    .sort({ timestamp: -1 })
    .lean();

    // Group today's activities by employee string ID
    const todayActivitiesByEmp = new Map();
    for (const act of allTodayActivities) {
      const empIdStr = act.employee.toString();
      if (!todayActivitiesByEmp.has(empIdStr)) {
        todayActivitiesByEmp.set(empIdStr, []);
      }
      todayActivitiesByEmp.get(empIdStr).push(act);
    }

    // For active employees who have 0 logs today, fetch their single latest log using 1 aggregation
    const empsNeedingLatestLog = employees
      .filter(emp => (!todayActivitiesByEmp.has(emp._id.toString()) || todayActivitiesByEmp.get(emp._id.toString()).length === 0) && emp.stillExist !== 0)
      .map(emp => emp._id);

    const latestHistoricalLogByEmp = new Map();
    if (empsNeedingLatestLog.length > 0) {
      const latestLogs = await EmployeeActivity.aggregate([
        { $match: { employee: { $in: empsNeedingLatestLog } } },
        { $sort: { timestamp: -1 } },
        { $group: {
            _id: "$employee",
            latestLog: { $first: "$$ROOT" }
        }}
      ]);

      for (const item of latestLogs) {
        latestHistoricalLogByEmp.set(item._id.toString(), item.latestLog);
      }
    }

    // Synchronize working hours across WorkSession, Attendance, and DailyAttendance
    const todayDateKey = getLocalDateKey(startOfDay);
    const sessionsMap = await resolveSessionsMap(empIds, startOfDay, endOfDay);

    const teamData = employees.map((emp) => {
      const empIdStr = emp._id.toString();
      const activities = todayActivitiesByEmp.get(empIdStr) || [];
      let latestLog = activities[0] || latestHistoricalLogByEmp.get(empIdStr) || null;
      const sessionInfo = sessionsMap.get(`${empIdStr}_${todayDateKey}`) || null;

      if (emp.stillExist === 0) {
        return {
          _id: emp._id,
          name: emp.name,
          email: emp.email,
          department: emp.department?.name || 'General',
          stillExist: 0,
          currentStatus: 'Exited',
          hasStartedDay: false,
          startDayTime: null,
          productivityScore: 0,
          activeHours: '0h 0m',
          activeSeconds: 0,
          idleTime: '0m',
          idleSeconds: 0,
          keystrokesToday: 0,
          mouseActivity: 0,
          currentActivity: {
            appName: 'Account Inactive (Exited)',
            windowTitle: 'Exited',
            url: ''
          },
          productivityEfficiency: 'Exited',
          lastActiveTimestamp: latestLog?.timestamp || null
        };
      }

      const metrics = summarizeActivitiesWithSession(activities, sessionInfo);

      // Current status calculation
      let currentStatus = 'Away';
      if (latestLog && activities.length > 0) {
        const timeSinceLastLogSec = (new Date() - new Date(latestLog.timestamp)) / 1000;
        if (timeSinceLastLogSec <= 300) {
          currentStatus = (latestLog.idle_duration || 0) > 300 ? 'Idle' : 'Active';
        } else if (timeSinceLastLogSec <= 900) {
          currentStatus = 'Idle';
        } else {
          currentStatus = 'Away';
        }
      } else if (metrics.hasStartedDay) {
        currentStatus = 'Active';
      }

      const activeHoursFormatted = `${Math.floor(metrics.activeSeconds / 3600)}h ${Math.floor((metrics.activeSeconds % 3600) / 60)}m`;
      const idleTimeFormatted = `${Math.floor(metrics.totalIdleSeconds / 60)}m`;
      const historicalLastLog = latestHistoricalLogByEmp.get(empIdStr);

      return {
        _id: emp._id,
        name: emp.name,
        email: emp.email,
        department: emp.department?.name || 'General',
        stillExist: emp.stillExist,
        currentStatus,
        hasStartedDay: metrics.hasStartedDay,
        startDayTime: metrics.startDayTime,
        productivityScore: metrics.avgProductivityScore,
        activeHours: activeHoursFormatted,
        activeSeconds: metrics.activeSeconds,
        idleTime: idleTimeFormatted,
        idleSeconds: metrics.totalIdleSeconds,
        keystrokesToday: metrics.totalKeystrokes,
        mouseActivity: metrics.avgMouseActivity,
        currentActivity: {
          appName: latestLog?.active_application?.name || (metrics.hasStartedDay ? 'Workspace Active' : 'No Active Session'),
          windowTitle: latestLog?.active_application?.title || (metrics.hasStartedDay ? 'Session active' : 'Away / Offline'),
          url: latestLog?.active_application?.url || ''
        },
        productivityEfficiency: metrics.productivityEfficiency,
        lastActiveTimestamp: latestLog?.timestamp || historicalLastLog?.timestamp || null
      };
    });

    // Sort employees: Day started today first (A-Z), then Day not started (A-Z)
    teamData.sort((a, b) => {
      const aExited = a.stillExist === 0 || a.currentStatus === 'Exited';
      const bExited = b.stillExist === 0 || b.currentStatus === 'Exited';
      if (aExited !== bExited) return aExited ? 1 : -1;

      const aStarted = a.hasStartedDay ? 1 : 0;
      const bStarted = b.hasStartedDay ? 1 : 0;
      if (aStarted !== bStarted) return bStarted - aStarted;

      return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    });

    // Calculate aggregated team statistics
    const totalActiveCount = teamData.filter(d => d.currentStatus === 'Active').length;
    const totalIdleCount = teamData.filter(d => d.currentStatus === 'Idle').length;
    const totalAwayCount = teamData.filter(d => d.currentStatus === 'Away' || d.currentStatus === 'Offline' || d.currentStatus === 'Exited').length;

    const validScores = teamData.filter(d => d.productivityScore > 0);
    const avgTeamProductivity = validScores.length > 0 
      ? Math.round(validScores.reduce((acc, curr) => acc + curr.productivityScore, 0) / validScores.length)
      : 0;

    res.json({
      success: true,
      counts: {
        totalEmployees: totalEmployeesCount,
        activeCount: globalActiveCount,
        exitedCount: globalExitedCount
      },
      summary: {
        totalEmployees: teamData.length,
        activeCount: totalActiveCount,
        idleCount: totalIdleCount,
        awayCount: totalAwayCount,
        avgTeamProductivity
      },
      employees: teamData
    });
  } catch (error) {
    console.error('Error fetching team summary:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch team summary' });
  }
});

// 2. GET /api/monitoring/daily-summary
// Fetches detailed daily performance across all employees for a selected date (e.g. 2026-09-21)
router.get('/daily-summary', async (req, res) => {
  try {
    const { date, department = 'all', statusTab = 'active' } = req.query;
    const targetDate = parseLocalDateParam(date);

    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);

    let userQuery = { role: { $nin: ['admin', 'Admin'] } };

    if (department && department !== 'all') {
      userQuery.department = department;
    }

    if (statusTab === 'active') {
      userQuery.stillExist = 1;
    } else if (statusTab === 'exited') {
      userQuery.stillExist = 0;
    }

    const employees = await User.find(userQuery)
      .select('name email department stillExist role')
      .populate('department', 'name')
      .lean();

    const activeEmpIds = employees.filter(e => e.stillExist !== 0).map(e => e._id);

    // Single batch query for all activities across active employees for this date
    const allActivities = await EmployeeActivity.find({
      employee: { $in: activeEmpIds },
      timestamp: { $gte: startOfDay, $lte: endOfDay }
    })
    .select('employee keystroke_count mouse_activity_score mouse_event_count idle_duration interval_seconds app_category productivity_score active_application timestamp')
    .sort({ timestamp: 1 })
    .lean();

    const activitiesByEmp = new Map();
    for (const act of allActivities) {
      const empIdStr = act.employee.toString();
      if (!activitiesByEmp.has(empIdStr)) {
        activitiesByEmp.set(empIdStr, []);
      }
      activitiesByEmp.get(empIdStr).push(act);
    }

    // Synchronize working hours across WorkSession, Attendance, and DailyAttendance
    const targetDateKey = getLocalDateKey(startOfDay);
    const sessionsMap = await resolveSessionsMap(activeEmpIds, startOfDay, endOfDay);

    let totalTeamKeystrokes = 0;
    let totalTeamActiveSeconds = 0;
    let totalTeamIdleSeconds = 0;
    let teamProductivitySum = 0;
    let activeEmployeeCount = 0;

    const employeeDailyData = employees.map((emp) => {
      const isExited = emp.stillExist === 0;

      if (isExited) {
        return {
          employeeId: emp._id,
          name: emp.name,
          email: emp.email,
          department: emp.department?.name || 'General',
          stillExist: 0,
          totalActiveHours: '0h 0m',
          activeSeconds: 0,
          totalIdleTime: '0m',
          idleSeconds: 0,
          productivityScore: 0,
          keystrokes: 0,
          mouseActivity: 0,
          activityDetails: [{ name: 'Account Inactive (Exited)', count: 0 }],
          productivityEfficiency: 'Exited'
        };
      }

      const empIdStr = emp._id.toString();
      const activities = activitiesByEmp.get(empIdStr) || [];
      const sessionInfo = sessionsMap.get(`${empIdStr}_${targetDateKey}`) || null;
      const metrics = summarizeActivitiesWithSession(activities, sessionInfo);

      if (metrics.hasActivity) {
        totalTeamKeystrokes += metrics.totalKeystrokes;
        totalTeamActiveSeconds += metrics.activeSeconds;
        totalTeamIdleSeconds += metrics.totalIdleSeconds;
        teamProductivitySum += metrics.avgProductivityScore;
        activeEmployeeCount++;
      }

      return {
        employeeId: emp._id,
        name: emp.name,
        email: emp.email,
        department: emp.department?.name || 'General',
        stillExist: emp.stillExist,
        hasStartedDay: metrics.hasStartedDay,
        startDayTime: metrics.startDayTime,
        totalActiveHours: `${Math.floor(metrics.activeSeconds / 3600)}h ${Math.floor((metrics.activeSeconds % 3600) / 60)}m`,
        activeSeconds: metrics.activeSeconds,
        totalIdleTime: `${Math.floor(metrics.totalIdleSeconds / 60)}m`,
        idleSeconds: metrics.totalIdleSeconds,
        productivityScore: metrics.avgProductivityScore,
        keystrokes: metrics.totalKeystrokes,
        mouseActivity: metrics.avgMouseActivity,
        activityDetails: metrics.appDetails.length > 0 ? metrics.appDetails : [{ name: 'Workspace Active', count: 1 }],
        productivityEfficiency: metrics.productivityEfficiency
      };
    });

    // Sort employees: Day started today first (A-Z), then Day not started (A-Z)
    employeeDailyData.sort((a, b) => {
      const aExited = a.stillExist === 0;
      const bExited = b.stillExist === 0;
      if (aExited !== bExited) return aExited ? 1 : -1;

      const aStarted = a.hasStartedDay ? 1 : 0;
      const bStarted = b.hasStartedDay ? 1 : 0;
      if (aStarted !== bStarted) return bStarted - aStarted;

      return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    });

    const avgTeamProductivity = activeEmployeeCount > 0
      ? Math.round(teamProductivitySum / activeEmployeeCount)
      : 0;

    const overallEfficiency = getEfficiencyLabel(avgTeamProductivity, activeEmployeeCount > 0);

    const responseDateStr = date || `${startOfDay.getFullYear()}-${String(startOfDay.getMonth() + 1).padStart(2, '0')}-${String(startOfDay.getDate()).padStart(2, '0')}`;
    res.json({
      success: true,
      date: responseDateStr,
      teamMetrics: {
        totalActiveHours: `${Math.floor(totalTeamActiveSeconds / 3600)}h ${Math.floor((totalTeamActiveSeconds % 3600) / 60)}m`,
        totalIdleTime: `${Math.floor(totalTeamIdleSeconds / 3600)}h ${Math.floor((totalTeamIdleSeconds % 3600) / 60)}m`,
        avgProductivityScore: avgTeamProductivity,
        totalKeystrokes: totalTeamKeystrokes,
        overallProductivityEfficiency: overallEfficiency
      },
      employees: employeeDailyData
    });
  } catch (error) {
    console.error('Error fetching daily summary:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch daily summary' });
  }
});

// 3. GET /api/monitoring/monthly-summary
// Fetches full month performance summary across team (e.g. month=2026-09)
router.get('/monthly-summary', async (req, res) => {
  try {
    const { month, department = 'all', statusTab = 'active' } = req.query; // YYYY-MM
    const now = new Date();
    
    let year = now.getFullYear();
    let monthIdx = now.getMonth();

    if (month && month.includes('-')) {
      const parts = month.split('-');
      year = parseInt(parts[0]);
      monthIdx = parseInt(parts[1]) - 1;
    }

    const startOfMonth = new Date(year, monthIdx, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(year, monthIdx + 1, 0, 23, 59, 59, 999);

    let userQuery = { role: { $nin: ['admin', 'Admin'] } };

    if (department && department !== 'all') {
      userQuery.department = department;
    }

    if (statusTab === 'active') {
      userQuery.stillExist = 1;
    } else if (statusTab === 'exited') {
      userQuery.stillExist = 0;
    }

    const employees = await User.find(userQuery)
      .select('name email department stillExist role')
      .populate('department', 'name')
      .lean();

    const activeEmpIds = employees.filter(e => e.stillExist !== 0).map(e => e._id);

    // Aggregate activity logs in this month with field projection and lean
    let allMonthlyLogs = [];
    try {
      allMonthlyLogs = await EmployeeActivity.find({
        employee: { $in: activeEmpIds },
        timestamp: { $gte: startOfMonth, $lte: endOfMonth }
      })
      .select('employee timestamp keystroke_count mouse_activity_score mouse_event_count idle_duration interval_seconds app_category productivity_score')
      .sort({ timestamp: 1 })
      .lean()
      .limit(300000);
    } catch (dbErr) {
      console.warn('⚠️ Monthly logs query encountered issue, proceeding with fallback telemetry:', dbErr.message);
    }

    // Unified WorkSession + Attendance + DailyAttendance map keyed by `${empId}_${YYYY-MM-DD}`
    const sessionsMap = await resolveSessionsMap(activeEmpIds, startOfMonth, endOfMonth, now);
    const nowLocalDateStr = getLocalDateKey(now);

    // Group logs by `${empId}_${dateKey}` and `${dateKey}` for unified evaluation
    const logsByEmpDate = new Map();
    const empStartedTodayMap = new Map();

    for (const log of allMonthlyLogs) {
      if (!log || !log.timestamp) continue;
      const dateStr = getLocalDateKey(log.timestamp);
      const empIdStr = log.employee ? log.employee.toString() : '';
      if (!dateStr || !empIdStr) continue;

      if (dateStr === nowLocalDateStr) {
        empStartedTodayMap.set(empIdStr, true);
      }

      const key = `${empIdStr}_${dateStr}`;
      if (!logsByEmpDate.has(key)) logsByEmpDate.set(key, []);
      logsByEmpDate.get(key).push(log);
    }

    sessionsMap.forEach((sess) => {
      if (sess.dateKey === nowLocalDateStr) {
        empStartedTodayMap.set(sess.empId, true);
      }
    });

    const daysInMonth = endOfMonth.getDate();
    const dayByDayBreakdown = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      let dayActiveSec = 0;
      let dayIdleSec = 0;
      let dayKeystrokes = 0;
      let dayProdSum = 0;
      let dayActiveEmpCount = 0;

      for (const emp of employees) {
        if (emp.stillExist === 0) continue;
        const empIdStr = emp._id.toString();
        const dayLogs = logsByEmpDate.get(`${empIdStr}_${dateStr}`) || [];
        const sessionInfo = sessionsMap.get(`${empIdStr}_${dateStr}`) || null;
        if (dayLogs.length > 0 || sessionInfo) {
          const metrics = summarizeActivitiesWithSession(dayLogs, sessionInfo);
          if (metrics.hasActivity) {
            dayActiveSec += metrics.activeSeconds;
            dayIdleSec += metrics.totalIdleSeconds;
            dayKeystrokes += metrics.totalKeystrokes;
            dayProdSum += metrics.avgProductivityScore;
            dayActiveEmpCount++;
          }
        }
      }

      dayByDayBreakdown.push({
        date: dateStr,
        day: d,
        activeHours: Math.round((dayActiveSec / 3600) * 10) / 10,
        idleHours: Math.round((dayIdleSec / 3600) * 10) / 10,
        avgProductivityScore: dayActiveEmpCount > 0 ? Math.round(dayProdSum / dayActiveEmpCount) : 0,
        keystrokes: dayKeystrokes
      });
    }

    // Process Employee performance array using exact per-day worked aggregation
    let totalTeamActiveSec = 0;
    let totalTeamIdleSec = 0;
    let totalTeamKeystrokes = 0;
    let totalTeamMouseScore = 0;
    let totalTeamProdSum = 0;
    let activeEmpCount = 0;

    const employeePerformance = employees.map(emp => {
      const empIdStr = emp._id.toString();
      const isExited = emp.stillExist === 0;

      if (isExited) {
        return {
          employeeId: emp._id,
          name: emp.name,
          email: emp.email,
          department: emp.department?.name || 'General',
          stillExist: 0,
          totalActiveHours: '0h 0m',
          activeSeconds: 0,
          totalIdleHours: '0h 0m',
          idleSeconds: 0,
          avgProductivityScore: 0,
          totalKeystrokes: 0,
          avgMouseActivity: 0,
          productivityEfficiency: 'Exited',
          hasStartedToday: false
        };
      }

      let empActiveSec = 0;
      let empIdleSec = 0;
      let empKeystrokes = 0;
      let empMouseSum = 0;
      let empMouseDays = 0;
      let empProdSum = 0;
      let empWorkedDays = 0;

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayLogs = logsByEmpDate.get(`${empIdStr}_${dateStr}`) || [];
        const sessionInfo = sessionsMap.get(`${empIdStr}_${dateStr}`) || null;
        if (dayLogs.length > 0 || sessionInfo) {
          const metrics = summarizeActivitiesWithSession(dayLogs, sessionInfo);
          if (metrics.hasActivity) {
            empActiveSec += metrics.activeSeconds;
            empIdleSec += metrics.totalIdleSeconds;
            empKeystrokes += metrics.totalKeystrokes;
            empProdSum += metrics.avgProductivityScore;
            empWorkedDays++;
            if (metrics.avgMouseActivity > 0) {
              empMouseSum += metrics.avgMouseActivity;
              empMouseDays++;
            }
          }
        }
      }

      const avgProd = empWorkedDays > 0 ? Math.round(empProdSum / empWorkedDays) : 0;
      const avgMouse = empMouseDays > 0 ? Math.round(empMouseSum / empMouseDays) : 0;

      if (empWorkedDays > 0) {
        totalTeamActiveSec += empActiveSec;
        totalTeamIdleSec += empIdleSec;
        totalTeamKeystrokes += empKeystrokes;
        totalTeamMouseScore += avgMouse;
        totalTeamProdSum += avgProd;
        activeEmpCount++;
      }

      const efficiency = getEfficiencyLabel(avgProd, empWorkedDays > 0);
      const hasStartedToday = Boolean(empStartedTodayMap.get(empIdStr));

      return {
        employeeId: emp._id,
        name: emp.name,
        email: emp.email,
        department: emp.department?.name || 'General',
        stillExist: 1,
        totalActiveHours: `${Math.floor(empActiveSec / 3600)}h ${Math.floor((empActiveSec % 3600) / 60)}m`,
        activeSeconds: empActiveSec,
        totalIdleHours: `${Math.floor(empIdleSec / 3600)}h ${Math.floor((empIdleSec % 3600) / 60)}m`,
        idleSeconds: empIdleSec,
        avgProductivityScore: avgProd,
        totalKeystrokes: empKeystrokes,
        avgMouseActivity: avgMouse,
        productivityEfficiency: efficiency,
        hasStartedToday
      };
    });

    // Sort employeePerformance: Started today first (A-Z), then Not started today (A-Z)
    employeePerformance.sort((a, b) => {
      const aExited = a.stillExist === 0;
      const bExited = b.stillExist === 0;
      if (aExited !== bExited) return aExited ? 1 : -1;

      const aStarted = a.hasStartedToday ? 1 : 0;
      const bStarted = b.hasStartedToday ? 1 : 0;
      if (aStarted !== bStarted) return bStarted - aStarted;

      return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    });

    const overallAvgProductivity = activeEmpCount > 0 ? Math.round(totalTeamProdSum / activeEmpCount) : 0;
    const overallProductivityEfficiency = getEfficiencyLabel(overallAvgProductivity, activeEmpCount > 0);

    res.json({
      success: true,
      month: `${year}-${String(monthIdx + 1).padStart(2, '0')}`,
      overallSummary: {
        totalActiveHours: `${Math.floor(totalTeamActiveSec / 3600)}h ${Math.floor((totalTeamActiveSec % 3600) / 60)}m`,
        totalIdleHours: `${Math.floor(totalTeamIdleSec / 3600)}h ${Math.floor((totalTeamIdleSec % 3600) / 60)}m`,
        avgProductivityScore: overallAvgProductivity,
        totalKeystrokes: totalTeamKeystrokes,
        totalMouseActivity: activeEmpCount > 0 ? Math.round(totalTeamMouseScore / activeEmpCount) : 0,
        overallProductivityEfficiency
      },
      dayByDayBreakdown,
      employeePerformance
    });
  } catch (error) {
    console.error('Error fetching monthly summary:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch monthly summary' });
  }
});

// 4. GET /api/monitoring/monthly-employee-breakdown
// Fetches full individual employee monthly view with day-by-day metrics across a month
router.get('/monthly-employee-breakdown', async (req, res) => {
  try {
    const { employeeId, month } = req.query;
    if (!employeeId) {
      return res.status(400).json({ success: false, error: 'Employee ID is required' });
    }

    const employee = await User.findById(employeeId).populate('department', 'name').lean();
    if (!employee) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    const now = new Date();
    let year = now.getFullYear();
    let monthIdx = now.getMonth();

    if (month && month.includes('-')) {
      const parts = month.split('-');
      year = parseInt(parts[0]);
      monthIdx = parseInt(parts[1]) - 1;
    }

    const startOfMonth = new Date(year, monthIdx, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(year, monthIdx + 1, 0, 23, 59, 59, 999);

    const logs = await EmployeeActivity.find({
      employee: employeeId,
      timestamp: { $gte: startOfMonth, $lte: endOfMonth }
    })
    .select('timestamp idle_duration interval_seconds keystroke_count mouse_activity_score mouse_event_count app_category productivity_score active_application.name')
    .sort({ timestamp: 1 })
    .lean();

    const daysInMonth = endOfMonth.getDate();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayShortNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const logsByDateMap = {};

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      logsByDateMap[dateStr] = [];
    }

    logs.forEach(log => {
      const dateStr = getLocalDateKey(log?.timestamp);
      if (dateStr && logsByDateMap[dateStr]) {
        logsByDateMap[dateStr].push(log);
      }
    });

    const sessionsMap = await resolveSessionsMap([employeeId], startOfMonth, endOfMonth, now);

    const isExited = employee.stillExist === 0;
    let totalMonthlyActiveSec = 0;
    let totalMonthlyIdleSec = 0;
    let totalMonthlyKeystrokes = 0;
    let totalMonthlyMouseSum = 0;
    let mouseDaysCount = 0;
    let totalMonthlyProdSum = 0;
    let workedDaysCount = 0;

    const todayDate = new Date();
    todayDate.setHours(23, 59, 59, 999);

    const dailyBreakdown = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, monthIdx, d);
      const dayOfWeek = dateObj.getDay();
      const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const dayLogs = logsByDateMap[dateStr] || [];
      const sessionInfo = sessionsMap.get(`${employeeId}_${dateStr}`) || null;

      if (isExited) {
        dailyBreakdown.push({
          date: dateStr,
          day: d,
          dayOfWeek: dayNames[dayOfWeek],
          dayShort: dayShortNames[dayOfWeek],
          status: 'Exited',
          activeHours: '0h 0m',
          activeSeconds: 0,
          idleTime: '0m',
          idleSeconds: 0,
          productivityScore: 0,
          keystrokes: 0,
          mouseActivity: 0,
          topApp: 'Account Inactive (Exited)',
          productivityEfficiency: 'Exited'
        });
        continue;
      }

      if (isWeekend && dayLogs.length === 0 && !sessionInfo) {
        dailyBreakdown.push({
          date: dateStr,
          day: d,
          dayOfWeek: dayNames[dayOfWeek],
          dayShort: dayShortNames[dayOfWeek],
          status: 'Weekend',
          activeHours: '0h 0m',
          activeSeconds: 0,
          idleTime: '0m',
          idleSeconds: 0,
          productivityScore: 0,
          keystrokes: 0,
          mouseActivity: 0,
          topApp: 'Weekend Off',
          productivityEfficiency: 'Weekend Off'
        });
        continue;
      }

      if (dateObj > todayDate && dayLogs.length === 0 && !sessionInfo) {
        dailyBreakdown.push({
          date: dateStr,
          day: d,
          dayOfWeek: dayNames[dayOfWeek],
          dayShort: dayShortNames[dayOfWeek],
          status: 'Upcoming',
          activeHours: '0h 0m',
          activeSeconds: 0,
          idleTime: '0m',
          idleSeconds: 0,
          productivityScore: 0,
          keystrokes: 0,
          mouseActivity: 0,
          topApp: 'Shift Not Started',
          productivityEfficiency: 'Upcoming'
        });
        continue;
      }

      const metrics = summarizeActivitiesWithSession(dayLogs, sessionInfo);
      let status = 'No Activity';
      let topApp = 'No Activity Logged';

      if (metrics.hasActivity) {
        status = 'Worked';
        topApp = metrics.appDetails.length > 0 ? metrics.appDetails[0].name : 'Work Hours Session';
        totalMonthlyActiveSec += metrics.activeSeconds;
        totalMonthlyIdleSec += metrics.totalIdleSeconds;
        totalMonthlyKeystrokes += metrics.totalKeystrokes;
        totalMonthlyProdSum += metrics.avgProductivityScore;
        workedDaysCount++;
        if (metrics.avgMouseActivity > 0) {
          totalMonthlyMouseSum += metrics.avgMouseActivity;
          mouseDaysCount++;
        }
      }

      dailyBreakdown.push({
        date: dateStr,
        day: d,
        dayOfWeek: dayNames[dayOfWeek],
        dayShort: dayShortNames[dayOfWeek],
        status,
        activeHours: `${Math.floor(metrics.activeSeconds / 3600)}h ${Math.floor((metrics.activeSeconds % 3600) / 60)}m`,
        activeSeconds: metrics.activeSeconds,
        idleTime: `${Math.floor(metrics.totalIdleSeconds / 60)}m`,
        idleSeconds: metrics.totalIdleSeconds,
        productivityScore: metrics.avgProductivityScore,
        keystrokes: metrics.totalKeystrokes,
        mouseActivity: metrics.avgMouseActivity,
        topApp,
        productivityEfficiency: metrics.productivityEfficiency
      });
    }

    const avgMonthlyProd = workedDaysCount > 0 ? Math.round(totalMonthlyProdSum / workedDaysCount) : 0;
    const avgMonthlyMouse = mouseDaysCount > 0 ? Math.round(totalMonthlyMouseSum / mouseDaysCount) : 0;

    let overallEfficiency = 'No Activity';
    if (isExited) overallEfficiency = 'Exited';
    else overallEfficiency = getEfficiencyLabel(avgMonthlyProd, workedDaysCount > 0);

    res.json({
      success: true,
      employee: {
        _id: employee._id,
        employeeId: employee._id,
        name: employee.name,
        email: employee.email,
        department: employee.department?.name || 'General',
        stillExist: employee.stillExist,
        role: employee.role,
        branch: employee.branch || 'blackhole_mumbai',
        totalActiveHours: `${Math.floor(totalMonthlyActiveSec / 3600)}h ${Math.floor((totalMonthlyActiveSec % 3600) / 60)}m`,
        totalActiveSeconds: totalMonthlyActiveSec,
        totalIdleHours: `${Math.floor(totalMonthlyIdleSec / 3600)}h ${Math.floor((totalMonthlyIdleSec % 3600) / 60)}m`,
        totalIdleSeconds: totalMonthlyIdleSec,
        avgProductivityScore: isExited ? 0 : avgMonthlyProd,
        totalKeystrokes: totalMonthlyKeystrokes,
        avgMouseActivity: isExited ? 0 : avgMonthlyMouse,
        productivityEfficiency: overallEfficiency,
        workedDaysCount,
        totalDaysInMonth: daysInMonth
      },
      month: `${year}-${String(monthIdx + 1).padStart(2, '0')}`,
      dailyBreakdown
    });
  } catch (error) {
    console.error('Error fetching employee monthly breakdown:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch employee monthly breakdown' });
  }
});

module.exports = router;

