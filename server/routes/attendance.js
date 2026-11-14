const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const ExcelJS = require('exceljs');
const XLSX = require('xlsx');
const fs = require('fs');
const geolib = require('geolib');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const UserTag = require('../models/UserTag');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const DailyAttendance = require('../models/DailyAttendance');
const { reverseGeocode } = require('../utils/reverseGeocode');
const {
  signalNormalActivity,
  signalLateCheckin,
  signalExcessiveIdle,
} = require('../services/karmaClient');

// Helper to get branch filter from request
const getBranchQuery = (req) => {
  const selectedBranch = req.headers['x-branch'] || req.query.branch;
  if (selectedBranch && selectedBranch !== 'all') {
    return { branch: selectedBranch };
  }
  return {};
};

// SIMPLE RULE: Spam validation = EXACTLY 8 hours for cumulative calculation
const SPAM_VALIDATION_HOURS = 8;

// Configure multer for Excel file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.mimetype === 'text/csv') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'), false);
    }
  }
});

// Office coordinates - Blackhole Infiverse LLP Mumbai
// Address: Road Number 3, near Hathi Circle, above Bright Connection, Kala Galli, Motilal Nagar II, Goregaon West, Mumbai, Maharashtra
const OFFICE_COORDINATES = {
  latitude: parseFloat(process.env.OFFICE_LAT) || 19.158900,
  longitude: parseFloat(process.env.OFFICE_LNG) || 72.838645
};
const OFFICE_RADIUS = parseInt(process.env.OFFICE_RADIUS) || 2000; // meters
const MAX_WORKING_HOURS = parseInt(process.env.MAX_WORKING_HOURS) || 10;
const AUTO_END_DAY_ENABLED = process.env.AUTO_END_DAY_ENABLED === 'true';
const OFFICE_ADDRESS = 'Blackhole Infiverse LLP, Road Number 3, near Hathi Circle, above Bright Connection, Kala Galli, Motilal Nagar II, Goregaon West, Mumbai, Maharashtra';

// Helper: Extract client IP address handling reverse proxies and IPv6 mapping
const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const list = forwarded.split(',');
    return list[0].trim().replace(/^::ffff:/, '');
  }
  return (req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
};

// Helper: Check if IP is in configured office network or local development
const isOfficeIp = (ip) => {
  if (!ip) return false;
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
  const configured = process.env.OFFICE_IPS || '';
  if (!configured.trim()) return false;
  const list = configured.split(',').map(s => s.trim().replace(/^::ffff:/, '')).filter(Boolean);
  return list.includes(ip);
};

// Simple start day route for backward compatibility (used by test and simple clients)
router.post('/start', auth, async (req, res) => {
  try {
    const userId = req.user.id; // Get userId from auth token
    const { location, notes, latitude, longitude, address, accuracy, workFromHome, homeLocation } = req.body;
    
    // Extract coordinates - support both direct and nested location formats
    const finalLatitude = latitude || (location && location.latitude);
    const finalLongitude = longitude || (location && location.longitude);
    const finalAddress = address || (location && location.address) || 'Location not specified';
    const isWorkFromHome = workFromHome || (location && location.type === 'home');
    
    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Check if user has already started day
    let existingRecord = await Attendance.findOne({
      user: userId,
      date: { $gte: today, $lt: tomorrow }
    });

    // Only block if day is started AND not ended yet
    if (existingRecord && existingRecord.startDayTime && !existingRecord.endDayTime) {
      return res.status(400).json({
        error: 'Day already started',
        startTime: existingRecord.startDayTime,
        code: 'DAY_ALREADY_STARTED'
      });
    }

    const startTime = new Date();
    const workLocation = isWorkFromHome ? 'Home' : 'Office';

    if (existingRecord) {
      // Update existing record (restart after end-day)
      existingRecord.startDayTime = startTime;
      existingRecord.endDayTime = null;
      existingRecord.startDayLocation = { 
        latitude: finalLatitude, 
        longitude: finalLongitude, 
        address: finalAddress, 
        accuracy 
      };
      existingRecord.workLocation = workLocation;
      existingRecord.notes = notes || existingRecord.notes;
      await existingRecord.save();
    } else {
      // Create new record with branch from header or user
      const selectedBranch = req.headers['x-branch'] || req.query.branch || req.user?.branch || 'blackhole_mumbai';
      existingRecord = new Attendance({
        user: userId,
        date: today,
        startDayTime: startTime,
        startDayLocation: {
          latitude: finalLatitude,
          longitude: finalLongitude, 
          address: finalAddress,
          accuracy
        },
        workLocation,
        notes,
        officeHours: 0,
        remoteHours: 0,
        branch: selectedBranch,
        activities: [{
          type: 'StartDay',
          timestamp: startTime,
          location: { latitude: finalLatitude, longitude: finalLongitude, address: finalAddress },
          source: 'StartDay'
        }]
      });
      await existingRecord.save();
    }

    console.log(`✅ User ${userId} started work day at ${startTime} (${workLocation})`);
    
    return res.status(200).json({
      success: true,
      message: 'Work day started successfully',
      attendance: existingRecord,
      startTime: existingRecord.startDayTime
    });
  } catch (error) {
    console.error('Simple start route error:', error);
    return res.status(500).json({
      error: 'Failed to start work day',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Enhanced start day with geolocation validation and work from home option
router.post('/start-day/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    let { latitude, longitude, address, accuracy, workFromHome, homeLocation, deviceInfo } = req.body;
    
    // Verify user authorization
    if (req.user.id !== userId && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Detect client device type and office network IP
    const clientIp = getClientIp(req);
    const clientDeviceType = (deviceInfo?.deviceType || '').toLowerCase();
    const isDesktop = clientDeviceType === 'desktop' || (!/mobile|android|iphone|ipad/i.test(req.headers['user-agent'] || ''));
    const onOfficeNetwork = isOfficeIp(clientIp);

    // If Desktop on Office Network, physical GPS is not required
    if (isDesktop && onOfficeNetwork && !workFromHome) {
      if (latitude === undefined || latitude === null || longitude === undefined || longitude === null) {
        latitude = OFFICE_COORDINATES.latitude;
        longitude = OFFICE_COORDINATES.longitude;
      }
      if (!address) {
        address = 'Blackhole Infiverse LLP Office (Desktop LAN/Wi-Fi)';
      }
    } else if (!workFromHome) {
      // Validate geolocation for mobile, laptop, or non-office devices
      if (latitude === undefined || latitude === null || longitude === undefined || longitude === null) {
        return res.status(400).json({ 
          error: isDesktop 
            ? 'Desktop not on office network. Connect to Office Wi-Fi/LAN, allow location, or select Work From Home.'
            : 'Geolocation data required. Please allow location access on your mobile device/laptop.',
          code: 'LOCATION_REQUIRED'
        });
      }
    }
    
    let latNum = parseFloat(latitude);
    let lngNum = parseFloat(longitude);
    if (!isNaN(latNum) && !isNaN(lngNum)) {
      latitude = latNum;
      longitude = lngNum;
    } else if (!workFromHome && !(isDesktop && onOfficeNetwork)) {
      return res.status(400).json({ 
        error: 'Invalid geolocation coordinates',
        code: 'LOCATION_REQUIRED'
      });
    }

    const formattedCoords = (latitude !== undefined && longitude !== undefined) 
      ? `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}` 
      : 'Office Coordinates';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Check if user has already started day
    const existingRecord = await Attendance.findOne({
      user: userId,
      date: today
    });
    
    // Only block if day is started AND not ended yet
    if (existingRecord && existingRecord.startDayTime && !existingRecord.endDayTime) {
      return res.status(400).json({ 
        error: 'Day already started',
        startTime: existingRecord.startDayTime,
        code: 'DAY_ALREADY_STARTED'
      });
    }
    
    let workLocationType = 'Office';
    let locationValidated = false;
    
    if (workFromHome) {
      // Work from home - lock the location and get exact address
      workLocationType = 'Home';
      locationValidated = true;
      
      // If address is not provided or is generic, reverse geocode to get exact address
      let wfhAddress = address;
      if (!wfhAddress || wfhAddress === 'Work From Home' || wfhAddress.toLowerCase().includes('work from home')) {
        try {
          const geocodeResult = await reverseGeocode(latitude, longitude);
          // Always use the full address from geocoding result
          wfhAddress = (geocodeResult && (geocodeResult.fullAddress || geocodeResult.displayName)) || formattedCoords;
          console.log(`📍 User ${userId} starting work from home at: ${wfhAddress} (${latitude}, ${longitude})`);
        } catch (error) {
          console.warn(`⚠️ Reverse geocoding failed for WFH location: ${error.message}`);
          // Always provide coordinates as fallback address
          wfhAddress = formattedCoords;
          console.log(`📍 User ${userId} starting work from home at coordinates: ${wfhAddress}`);
        }
      } else {
        console.log(`📍 User ${userId} starting work from home at: ${wfhAddress} (${latitude}, ${longitude})`);
      }
      // Update address variable for later use
      address = wfhAddress;
    } else if (isDesktop && onOfficeNetwork) {
      // ✅ DESKTOP FAST-PATH: Verified via Office IP/LAN
      workLocationType = 'Office';
      locationValidated = true;
      console.log(`🖥️ Desktop user ${userId} verified via Office Network IP (${clientIp})`);
    } else {
      // Check if user is within office radius (Mobile, Laptop, or remote desktop)
      const distance = geolib.getDistance(
        { latitude: OFFICE_COORDINATES.latitude, longitude: OFFICE_COORDINATES.longitude },
        { latitude, longitude }
      );
      
      if (distance > OFFICE_RADIUS) {
        return res.status(400).json({
          error: `You must be within ${OFFICE_RADIUS}m of office premises to start your day (current distance: ${distance}m).`,
          distance: distance,
          allowedRadius: OFFICE_RADIUS,
          officeAddress: OFFICE_ADDRESS,
          officeCoordinates: OFFICE_COORDINATES,
          code: 'LOCATION_TOO_FAR',
          suggestion: 'Either go to office or select "Work From Home" option'
        });
      }
      
      workLocationType = 'Office';
      locationValidated = true;
      
      console.log(`🏢 User ${userId} starting work from office at distance: ${distance}m`);
    }
    
    const startTime = new Date();
    
    // Always reverse geocode to get detailed address (for both office and WFH)
    let finalAddress = address;
    if (!finalAddress || finalAddress === 'Work From Home' || finalAddress === 'Office Location' || finalAddress.toLowerCase().includes('work from home')) {
      try {
        const geocodeResult = await reverseGeocode(latitude, longitude);
        finalAddress = (geocodeResult && (geocodeResult.fullAddress || geocodeResult.displayName)) || formattedCoords;
        console.log(`📍 User ${userId} location geocoded: ${finalAddress} (${latitude}, ${longitude})`);
      } catch (error) {
        console.warn(`⚠️ Reverse geocoding failed: ${error.message}`);
        // Fallback to coordinates if geocoding fails
        finalAddress = formattedCoords;
        console.log(`📍 User ${userId} using coordinates as address fallback: ${finalAddress}`);
      }
    } else {
      // Use provided address as-is
      console.log(`📍 User ${userId} using provided address: ${finalAddress}`);
    }
    
    // Create or update attendance record
    let attendanceRecord;
    
    if (existingRecord) {
      // Update existing record (restart after end-day)
      existingRecord.startDayTime = startTime;
      existingRecord.endDayTime = undefined; // Clear end time for new work session
      existingRecord.hoursWorked = 0;
      existingRecord.overtimeHours = 0;
      existingRecord.breakTime = 0;
      existingRecord.startDayLocation = { latitude, longitude, address: finalAddress, accuracy };
      existingRecord.isPresent = true;
      existingRecord.source = 'StartDay';
      existingRecord.spamStatus = 'Valid';
      existingRecord.autoEnded = false;
      attendanceRecord = existingRecord;
      await attendanceRecord.save();
    } else {
      // Create new Attendance with branch
      const selectedBranch = req.headers['x-branch'] || req.query.branch || req.user?.branch || 'blackhole_mumbai';
      attendanceRecord = new Attendance({
        user: userId,
        date: today,
        startDayTime: startTime,
        startDayLocation: { latitude, longitude, address: finalAddress, accuracy },
        isPresent: true,
        source: 'StartDay',
        spamStatus: 'Valid',
        autoEnded: false,
        branch: selectedBranch
      });
      await attendanceRecord.save();
    }

    // Now handle DailyAttendance
    const existingDailyRecord = await DailyAttendance.findOne({
      user: userId,
      date: today
    });

    let dailyRecord;
    if (existingDailyRecord) {
      existingDailyRecord.startDayTime = startTime;
      existingDailyRecord.startDayLocation = { latitude, longitude, address: finalAddress, accuracy };
      existingDailyRecord.workLocationType = workLocationType;
      existingDailyRecord.isPresent = true;
      existingDailyRecord.status = 'Present';
      existingDailyRecord.source = 'StartDay';
      existingDailyRecord.spamStatus = 'Valid';
      existingDailyRecord.autoEnded = false;
      dailyRecord = existingDailyRecord;
    } else {
      // Create new daily record
      dailyRecord = new DailyAttendance({
        user: userId,
        date: today,
        startDayTime: startTime,
        startDayLocation: {
          latitude,
          longitude,
          address: finalAddress || (workFromHome ? 'Work From Home' : 'Office Location'),
          accuracy
        },
        workLocationType: workLocationType,
        isPresent: true,
        status: 'Present',
        source: 'StartDay',
        spamStatus: 'Valid',
        autoEnded: false
      });
    }
    
    await dailyRecord.save();

    // Keep WorkSession in sync so pause/resume and live timer always use a clean session for today
    try {
      const WorkSession = require('../models/WorkSession');
      let workSession = await WorkSession.findOne({
        employee: userId,
        date: {
          $gte: today,
          $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
        }
      });

      if (workSession) {
        workSession.startTime = startTime;
        workSession.startDayTime = startTime;
        workSession.endTime = undefined;
        workSession.endDayTime = undefined;
        workSession.pausedAt = undefined;
        workSession.resumedAt = undefined;
        workSession.totalBreakTime = 0;
        workSession.status = 'active';
        workSession.workLocation = workLocationType;
        workSession.startLocation = { latitude, longitude, address: finalAddress, accuracy };
      } else {
        workSession = new WorkSession({
          employee: userId,
          date: today,
          startTime,
          startDayTime: startTime,
          targetHours: 8,
          status: 'active',
          totalBreakTime: 0,
          workLocation: workLocationType,
          startLocation: { latitude, longitude, address: finalAddress, accuracy }
        });
      }
      await workSession.save();
    } catch (wsErr) {
      console.warn(`⚠️ Non-fatal: Failed to sync WorkSession on start-day for user ${userId}:`, wsErr.message);
    }
    
    // Safely update today's aim with work location if it exists (don't create default aims)
    try {
      const Aim = require('../models/Aim');
      let todayAim = await Aim.findOne({
        user: userId,
        date: {
          $gte: today,
          $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
        }
      });
      
      if (todayAim) {
        // Update existing aim with work location
        todayAim.workLocation = workLocationType;
        await todayAim.save();
        console.log(`🏢 Updated aim work location to ${workLocationType} for user ${userId}`);
      } else {
        console.log(`📝 No aim found for user ${userId} - user should set their own aim`);
      }
    } catch (aimErr) {
      console.warn(`⚠️ Non-fatal: Failed to sync workLocation to Aim for user ${userId}:`, aimErr.message);
    }
    
    // Emit socket event
    if (req.io) {
      req.io.emit('attendance:day-started', {
        userId,
        startTime,
        location: { latitude, longitude, address: finalAddress },
        workLocationType
      });
    }

    // KARMA: runtime milestone — day started
    signalNormalActivity(String(userId)).catch(() => {});

    res.json({
      success: true,
      message: `Day started successfully${workFromHome ? ' from home' : ' from office'}!`,
      startTime,
      location: { latitude, longitude, address: finalAddress },
      workLocationType,
      distanceFromOffice: workFromHome ? null : geolib.getDistance(
        { latitude: OFFICE_COORDINATES.latitude, longitude: OFFICE_COORDINATES.longitude },
        { latitude, longitude }
      )
    });
    
  } catch (error) {
    console.error('❌ Start day error for user', req.params?.userId || 'unknown', ':', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message || 'Failed to start day',
      details: error.message,
      code: 'START_DAY_FAILED'
    });
  }
});

// 🔧 FIXED: Enhanced end day with ONLY progress validation (aim validation removed)
router.post('/end-day/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { latitude, longitude, address, accuracy, notes } = req.body;
    
    // Verify user authorization
    if (req.user.id !== userId && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Find most recent open/unended attendance session for this user (supports overnight sessions across midnight)
    const attendanceRecord = await Attendance.findOne({
      user: userId,
      startDayTime: { $exists: true, $ne: null },
      $or: [{ endDayTime: { $exists: false } }, { endDayTime: null }]
    }).sort({ startDayTime: -1 });
    
    if (!attendanceRecord || !attendanceRecord.startDayTime) {
      return res.status(400).json({ 
        error: 'Day not started yet. Please start your day first.',
        code: 'DAY_NOT_STARTED'
      });
    }
    
    if (attendanceRecord.endDayTime) {
      return res.status(400).json({ 
        error: 'Day already ended',
        endTime: attendanceRecord.endDayTime,
        code: 'DAY_ALREADY_ENDED'
      });
    }
    
    // =====================================
    // MANDATORY VALIDATIONS BEFORE END DAY
    // =====================================
    
    // ✅ ONLY CHECK PROGRESS - AIM VALIDATION REMOVED
    const sessionDate = attendanceRecord.date || today;
    const sessionDateEnd = new Date(sessionDate);
    sessionDateEnd.setDate(sessionDateEnd.getDate() + 1);

    const Progress = require('../models/Progress');
    const todayProgress = await Progress.findOne({
      user: userId,
      date: {
        $gte: sessionDate,
        $lt: sessionDateEnd
      }
    });
    
    // Check if progress exists (lenient validation - just needs to exist)
    const hasProgressContent = todayProgress && (
      (todayProgress.notes && todayProgress.notes.trim() !== '') ||
      (todayProgress.achievements && todayProgress.achievements.trim() !== '') ||
      (todayProgress.blockers && todayProgress.blockers.trim() !== '') ||
      (todayProgress.tasksCompleted && todayProgress.tasksCompleted.length > 0) ||
      todayProgress.percentageCompleted !== undefined
    );
    
    // MANDATORY VALIDATION: Block end day if user has not updated daily progress
    if (!hasProgressContent) {
      console.log(`⛔ User ${userId} attempted to end day without progress update - blocking`);
      return res.status(400).json({
        error: 'Please submit your daily progress in the Progress tab before ending your work day.',
        code: 'PROGRESS_NOT_SET'
      });
    }
    
    // 🎯 Get aim for reference but don't block end-day if not completed
    const Aim = require('../models/Aim');
    const todayAim = await Aim.findOne({
      user: userId,
      date: {
        $gte: sessionDate,
        $lt: sessionDateEnd
      }
    });
    
    console.log(`✅ Progress validation passed for user ${userId} - Progress: ${hasProgressContent ? 'Yes' : 'No'} (notes: ${!!todayProgress?.notes}, achievements: ${!!todayProgress?.achievements}, blockers: ${!!todayProgress?.blockers}), Aim: ${todayAim?.completionStatus || 'No aim set'}`);
    
    // =====================================
    // PROCEED WITH END DAY
    // =====================================
    
    const endTime = new Date();
    
    attendanceRecord.endDayTime = endTime;
    if (latitude && longitude) {
      attendanceRecord.endDayLocation = {
        latitude,
        longitude,
        address,
        accuracy
      };
    }
    
    if (notes) {
      attendanceRecord.employeeNotes = notes;
    }

    // Calculate detailed working hours BEFORE saving with negative hours guard
    const startTime = attendanceRecord.startDayTime;
    const totalMilliseconds = endTime - startTime;
    const totalMinutes = Math.max(0, Math.floor(totalMilliseconds / (1000 * 60)));
    const hoursWorked = Math.max(0, totalMilliseconds / (1000 * 60 * 60));

    // 🔧 FETCH WORK SESSION TO GET BREAK TIME
    const WorkSession = require('../models/WorkSession');
    const workSession = await WorkSession.findOne({
      employee: userId,
      date: { $gte: sessionDate, $lt: sessionDateEnd }
    });
    
    let breakTimeMinutes = 0;
    if (workSession) {
      if (workSession.status === 'paused' && workSession.pausedAt) {
        const ongoingPauseMinutes = Math.max(0, Math.floor((endTime - new Date(workSession.pausedAt)) / (1000 * 60)));
        workSession.totalBreakTime = (workSession.totalBreakTime || 0) + ongoingPauseMinutes;
      }
      breakTimeMinutes = workSession.totalBreakTime || 0;
      workSession.status = 'completed';
      workSession.endTime = endTime;
      workSession.endDayTime = endTime;
      workSession.pausedAt = null;
      if (latitude && longitude) {
        workSession.endLocation = { latitude, longitude, address, accuracy };
      }
      await workSession.save().catch((err) => {
        console.warn(`⚠️ Non-fatal: Failed to complete WorkSession on end-day for ${userId}:`, err.message);
      });
      console.log(`⏸️ Found ${breakTimeMinutes} minutes of break time for user ${userId}`);
    }

    // Update attendance record with calculated values
    attendanceRecord.hoursWorked = Math.round(hoursWorked * 100) / 100;
    attendanceRecord.breakTime = breakTimeMinutes; // Set break time from work session
    attendanceRecord.isPresent = true;
    
    // Calculate overtime if applicable
    const standardHours = 8;
    if (hoursWorked > standardHours) {
      attendanceRecord.overtimeHours = Math.round((hoursWorked - standardHours) * 100) / 100;
    } else {
      attendanceRecord.overtimeHours = 0;
    }

    // Mark as verified since it's manually ended with validations
    attendanceRecord.isVerified = true;
    attendanceRecord.approvalStatus = 'Auto-Approved';
    attendanceRecord.spamStatus = 'Valid'; // Normal end-day flow - not spam
    attendanceRecord.autoEnded = false;

    await attendanceRecord.save();
    
    // Update DailyAttendance record as well
    const DailyAttendance = require('../models/DailyAttendance');
    const dailyRecord = await DailyAttendance.findOne({
      user: userId,
      date: sessionDate
    });
    
    if (dailyRecord) {
      dailyRecord.endDayTime = endTime;
      if (latitude && longitude) {
        dailyRecord.endDayLocation = {
          latitude,
          longitude,
          address,
          accuracy
        };
      }
      dailyRecord.totalHoursWorked = Math.round(hoursWorked * 100) / 100;
      dailyRecord.regularHours = Math.min(hoursWorked, standardHours);
      dailyRecord.overtimeHours = hoursWorked > standardHours ? Math.round((hoursWorked - standardHours) * 100) / 100 : 0;
      dailyRecord.breakTime = breakTimeMinutes; // Set break time from work session
      dailyRecord.isPresent = true;
      dailyRecord.status = 'Present';
      dailyRecord.dailyProgressCompleted = true;
      dailyRecord.dailyAimCompleted = todayAim ? (todayAim.completionStatus !== 'Pending') : false;
      dailyRecord.aimCompletionStatus = todayAim?.completionStatus || 'Not Set';
      dailyRecord.aimCompletionComment = todayAim?.completionComment || '';
      dailyRecord.spamStatus = 'Valid'; // Normal end-day flow - not spam
      dailyRecord.autoEnded = false;
      
      await dailyRecord.save();
    }
    
    // Emit socket event
    if (req.io) {
      req.io.emit('attendance:day-ended', {
        userId,
        endTime,
        hoursWorked: attendanceRecord.hoursWorked,
        progressCompleted: true,
        aimCompleted: todayAim ? (todayAim.completionStatus !== 'Pending') : false
      });
    }

    // KARMA: runtime milestone — day ended; flag idle if short hours
    if (attendanceRecord.hoursWorked < 4) {
      signalExcessiveIdle(String(userId), Math.round((8 - attendanceRecord.hoursWorked) * 60)).catch(() => {});
    } else {
      signalNormalActivity(String(userId)).catch(() => {});
    }

    res.json({
      success: true,
      message: `Day ended successfully! You worked ${attendanceRecord.hoursWorked} hours.`,
      data: {
        endTime,
        startTime: attendanceRecord.startDayTime,
        hoursWorked: attendanceRecord.hoursWorked,
        overtimeHours: attendanceRecord.overtimeHours,
        isOvertime: attendanceRecord.overtimeHours > 0,
        attendanceId: attendanceRecord._id,
        validations: {
          progressCompleted: true,
          aimCompleted: todayAim ? (todayAim.completionStatus !== 'Pending') : false,
          aimStatus: todayAim?.completionStatus || 'Not Set'
        }
      }
    });

  } catch (error) {
    console.error('End day error:', error);
    res.status(500).json({ 
      error: 'Failed to end day',
      details: error.message 
    });
  }
});

/**
 * AUTO END DAY AT MIDNIGHT - DISABLED
 */
router.post('/auto-end-day-midnight', auth, async (req, res) => {
  return res.status(400).json({
    success: false,
    error: 'Midnight auto-end day is permanently disabled. Work days continue until manually ended by the user.',
    code: 'AUTO_END_DISABLED'
  });
});

/**
 * POST /api/attendance/validate-spam-hours/:recordId
 * Admin validates spam hours - SIMPLE RULE: User gets EXACTLY 8 hours (not more, not less)
 * These 8 hours add to cumulative hours
 */
router.post('/validate-spam-hours/:recordId', auth, adminAuth, async (req, res) => {
  try {
    const { recordId } = req.params;
    const { reason } = req.body;

    // Find the attendance record
    const record = await Attendance.findById(recordId).populate('user', 'name email');
    
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    if (!record.autoEnded) {
      return res.status(400).json({ error: 'This record was not auto-ended' });
    }

    // SIMPLE LOGIC: Calculate correct hours if endDayTime is missing
    let actualHoursWorked = record.hoursWorked;
    
    if (!record.endDayTime && record.startDayTime) {
      // Record was never properly ended - calculate up to midnight of start day
      const startTime = new Date(record.startDayTime);
      const startDate = new Date(record.date);
      const midnightAfterStart = new Date(startDate);
      midnightAfterStart.setDate(midnightAfterStart.getDate() + 1);
      midnightAfterStart.setHours(0, 0, 0, 0);
      
      actualHoursWorked = (midnightAfterStart - startTime) / (1000 * 60 * 60);
      
      // Update the record with correct end time (midnight)
      record.endDayTime = midnightAfterStart;
      record.hoursWorked = Math.round(actualHoursWorked * 100) / 100;
      
      console.log(`🔧 Fixed missing endDayTime for ${record.user.name}: Hours to midnight: ${record.hoursWorked}h`);
    } else if (record.endDayTime && record.startDayTime) {
      // Recalculate to ensure accuracy
      const startTime = new Date(record.startDayTime);
      const endTime = new Date(record.endDayTime);
      actualHoursWorked = (endTime - startTime) / (1000 * 60 * 60);
      record.hoursWorked = Math.round(actualHoursWorked * 100) / 100;
    }

    // Save original hours before updating
    const originalHours = record.hoursWorked;

    // Determine validated hours:
    // If WFH, max 8h cap applies. If WFO, allow actual worked hours.
    const isWfh = record.workPattern === 'Remote' || record.workLocationType === 'Home';
    const validatedHours = isWfh 
      ? Math.min(8, Math.round(actualHoursWorked * 100) / 100) 
      : Math.round(actualHoursWorked * 100) / 100;
    
    // Detect if this is a midnight span
    const isMidnightSpan = record.spanType === 'MIDNIGHT_SPAN' || 
                           (record.spamReason && record.spamReason.toLowerCase().includes('midnight'));

    // Update record with validated hours
    record.hoursWorked = validatedHours;
    record.overtimeHours = validatedHours > 8 ? Math.round((validatedHours - 8) * 100) / 100 : 0;
    record.spamStatus = 'Valid';
    record.validatedBy = req.user.id;
    record.validatedAt = new Date();
    record.spamReason = reason || (isMidnightSpan 
      ? `Midnight span validated - ${validatedHours}h granted (actual: ${originalHours}h)` 
      : `Admin validated - User gets ${validatedHours} hours (actual: ${originalHours}h)`);
    record.approvalStatus = 'Approved';

    await record.save();

    // Also update DailyAttendance
    const dailyRecord = await DailyAttendance.findOne({
      user: record.user._id,
      date: record.date
    });

    if (dailyRecord) {
      dailyRecord.totalHoursWorked = validatedHours;
      dailyRecord.spamStatus = 'Valid';
      dailyRecord.validatedBy = req.user.id;
      dailyRecord.validatedAt = new Date();
      dailyRecord.spamReason = `Admin validated - Exactly 8 hours granted`;
      await dailyRecord.save();
    }

    console.log(`✅ Admin validated spam record for ${record.user.name}: Granted exactly 8h (actual was: ${originalHours}h)`);

    // KARMA: review outcome — attendance anomaly resolved
    signalNormalActivity(String(record.user._id)).catch(() => {});

    res.json({
      success: true,
      message: `Validated spam record - User gets exactly 8 hours`,
      data: {
        recordId: record._id,
        userName: record.user.name,
        actualHours: originalHours,
        validatedHours: validatedHours,
        rule: 'Spam validation always grants exactly 8 hours',
        validatedBy: req.user.name,
        validatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Validate spam hours error:', error);
    res.status(500).json({ error: 'Failed to validate spam hours', details: error.message });
  }
});

// Legacy auto-end day endpoint - returns info about new midnight system
router.post('/auto-end-day', auth, async (req, res) => {
  return res.status(400).json({ 
    error: 'Auto end day during work hours is disabled. Work days are auto-ended at midnight if not manually ended.',
    code: 'AUTO_END_DISABLED',
    info: 'Unended work days at midnight go to spam queue for admin validation (max 8 hours)'
  });
});

// OLD AUTO-END DAY CODE (DISABLED):
// router.post('/auto-end-day', auth, async (req, res) => {
//   try {
//     if (!AUTO_END_DAY_ENABLED) {
//       return res.status(400).json({ error: 'Auto end day is disabled' });
//     }

//     const today = new Date();
//     today.setHours(0, 0, 0, 0);

//     // Find all attendance records that started today but haven't ended
//     const activeAttendance = await Attendance.find({
//       date: today,
//       startDayTime: { $exists: true },
//       endDayTime: { $exists: false }
//     }).populate('user', 'name email');

//     const autoEndedUsers = [];
//     const currentTime = new Date();

//     for (const record of activeAttendance) {
//       const hoursWorked = (currentTime - record.startDayTime) / (1000 * 60 * 60);

//       if (hoursWorked >= MAX_WORKING_HOURS) {
//         // Auto end the day
//         record.endDayTime = currentTime;
//         record.employeeNotes = `Auto-ended after ${MAX_WORKING_HOURS} hours of work`;
//         record.autoEnded = true;

//         await record.save();

//         autoEndedUsers.push({
//           userId: record.user._id,
//           userName: record.user.name,
//           hoursWorked: Math.round(hoursWorked * 100) / 100,
//           autoEndTime: currentTime
//         });

//         // Emit socket event
//         if (req.io) {
//           req.io.emit('attendance:auto-day-ended', {
//             userId: record.user._id,
//             userName: record.user.name,
//             endTime: currentTime,
//             hoursWorked: record.hoursWorked,
//             reason: 'Exceeded maximum working hours'
//           });
//         }
//       }
//     }

//     res.json({
//       success: true,
//       message: `Auto-ended ${autoEndedUsers.length} user(s)`,
//       autoEndedUsers,
//       maxWorkingHours: MAX_WORKING_HOURS
//     });

//   } catch (error) {
//     console.error('Auto end day error:', error);
//     res.status(500).json({ error: 'Failed to auto end day' });
//   }
// });

// Get attendance analytics
router.get('/analytics', auth, async (req, res) => {
  try {
    const { startDate, endDate, userId, department } = req.query;
    const branchQuery = getBranchQuery(req);

    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date();

    // Build match condition with branch filter
    const matchCondition = {
      ...branchQuery,
      date: { $gte: start, $lte: end }
    };

    if (userId) {
      matchCondition.user = new mongoose.Types.ObjectId(userId);
    }

    if (department) {
      const users = await User.find({ department, ...branchQuery }).select('_id');
      matchCondition.user = { $in: users.map(u => u._id) };
    }

    // Get overall statistics
    const stats = await Attendance.getAttendanceStats(start, end, userId);

    // Get daily breakdown
    const dailyStats = await Attendance.aggregate([
      { $match: matchCondition },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          totalEmployees: { $addToSet: '$user' },
          presentCount: { $sum: { $cond: ['$isPresent', 1, 0] } },
          verifiedCount: { $sum: { $cond: ['$isVerified', 1, 0] } },
          leaveCount: { $sum: { $cond: ['$isLeave', 1, 0] } },
          discrepancyCount: { $sum: { $cond: ['$hasDiscrepancy', 1, 0] } },
          avgHours: { $avg: '$hoursWorked' },
          totalOvertimeHours: { $sum: '$overtimeHours' }
        }
      },
      {
        $project: {
          date: '$_id',
          totalEmployees: { $size: '$totalEmployees' },
          presentCount: 1,
          verifiedCount: 1,
          leaveCount: 1,
          discrepancyCount: 1,
          absentCount: { $subtract: [{ $size: '$totalEmployees' }, '$presentCount'] },
          attendanceRate: {
            $multiply: [
              { $divide: ['$presentCount', { $size: '$totalEmployees' }] },
              100
            ]
          },
          avgHours: { $round: ['$avgHours', 2] },
          totalOvertimeHours: { $round: ['$totalOvertimeHours', 2] }
        }
      },
      { $sort: { date: 1 } }
    ]);

    // Get top performers
    const topPerformers = await Attendance.aggregate([
      { $match: matchCondition },
      {
        $group: {
          _id: '$user',
          attendanceRate: {
            $avg: { $cond: ['$isPresent', 100, 0] }
          },
          avgHours: { $avg: '$hoursWorked' },
          totalOvertimeHours: { $sum: '$overtimeHours' },
          discrepancies: { $sum: { $cond: ['$hasDiscrepancy', 1, 0] } }
        }
      },
      { $sort: { attendanceRate: -1, avgHours: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          name: '$user.name',
          email: '$user.email',
          avatar: '$user.avatar',
          attendanceRate: { $round: ['$attendanceRate', 1] },
          avgHours: { $round: ['$avgHours', 2] },
          totalOvertimeHours: { $round: ['$totalOvertimeHours', 2] },
          discrepancies: 1
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        summary: stats,
        dailyBreakdown: dailyStats,
        topPerformers,
        dateRange: { start, end }
      }
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Get user-specific attendance records
router.get('/user/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, page = 1, limit = 30 } = req.query;

    // Verify user authorization
    if (req.user.id !== userId && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date();

    const skip = (page - 1) * limit;

    const records = await Attendance.find({
      user: userId,
      date: { $gte: start, $lte: end }
    })
    .sort({ date: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate('leaveReference', 'reason leaveType')
    .populate('approvedBy', 'name');

    const total = await Attendance.countDocuments({
      user: userId,
      date: { $gte: start, $lte: end }
    });

    const stats = await Attendance.getAttendanceStats(start, end, userId);

    res.json({
      success: true,
      data: {
        records,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        },
        stats
      }
    });

  } catch (error) {
    console.error('User attendance error:', error);
    res.status(500).json({ error: 'Failed to fetch user attendance' });
  }
});

// Verify attendance for a specific day
router.get('/verify/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { date } = req.query;

    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      user: userId,
      date: targetDate
    }).populate('user', 'name email');

    if (!attendance) {
      return res.json({
        success: true,
        data: {
          isPresent: false,
          isVerified: false,
          message: 'No attendance record found for this date'
        }
      });
    }

    res.json({
      success: true,
      data: {
        ...attendance.toObject(),
        statusDisplay: attendance.statusDisplay,
        statusColor: attendance.statusColor
      }
    });

  } catch (error) {
    console.error('Verify attendance error:', error);
    res.status(500).json({ error: 'Failed to verify attendance' });
  }
});

// Get live attendance data for dashboard
router.get('/live', adminAuth, async (req, res) => {
  try {
    const { date, department, status } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    const branchQuery = getBranchQuery(req);

    // Set date range for the day
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all active users filtered by branch
    let userQuery = { isActive: { $ne: false }, ...branchQuery }; // Users who are not explicitly deactivated
    if (department && department !== 'all') {
      userQuery.department = department;
    }
    
    const allUsers = await User.find(userQuery)
      .select('_id name email avatar department employeeId branch')
      .lean();

    console.log(`📊 Found ${allUsers.length} active users for branch: ${branchQuery.branch || 'all'}`);

    // Fetch attendance records for today filtered by branch
    const attendance = await Attendance.find({
      ...branchQuery,
      date: { $gte: startOfDay, $lte: endOfDay }
    })
      .populate('user', 'name email avatar department employeeId')
      .sort({ updatedAt: -1 })
      .lean();

    console.log(`📊 Found ${attendance.length} attendance records for today`);

    // Fetch work sessions for today to include pause/resume status
    const WorkSession = require('../models/WorkSession');
    const workSessions = await WorkSession.find({
      date: { $gte: startOfDay, $lte: endOfDay }
    })
      .select('employee status pausedAt resumedAt totalBreakTime targetHours startTime endTime')
      .lean();

    console.log(`📊 Found ${workSessions.length} work sessions for today`);

    // Create a map of user attendance and work sessions
    const attendanceMap = new Map();
    attendance.forEach(record => {
      if (record.user && record.user._id) {
        attendanceMap.set(record.user._id.toString(), record);
      }
    });

    const workSessionMap = new Map();
    workSessions.forEach(session => {
      if (session.employee) {
        workSessionMap.set(session.employee.toString(), session);
      }
    });

    // Build complete attendance list with all users
    const completeAttendance = allUsers.map(user => {
      const userId = user._id.toString();
      const attendanceRecord = attendanceMap.get(userId);
      const workSession = workSessionMap.get(userId);
      
      if (attendanceRecord) {
        // User has attendance record
        return {
          ...attendanceRecord,
          status: attendanceRecord.isPresent ? 
            (attendanceRecord.isLate ? 'late' : 'present') :
            (attendanceRecord.isLeave ? 'on-leave' : 'absent'),
          workSession: workSession || null // Include work session info
        };
      } else {
        // User has no attendance - mark as absent
        return {
          _id: null, // No attendance record ID
          user: user,
          date: startOfDay,
          isPresent: false,
          isVerified: false,
          isLeave: false,
          isLate: false,
          status: 'absent',
          startDayTime: null,
          endDayTime: null,
          hoursWorked: 0,
          workPattern: null,
          source: null,
          workSession: workSession || null // Include work session info even for absent users
        };
      }
    });

    // Apply status filter if provided
    let filteredAttendance = completeAttendance;
    if (status && status !== 'all') {
      filteredAttendance = completeAttendance.filter(record => {
        if (status === 'present') return record.isPresent && !record.isLate;
        if (status === 'absent') return !record.isPresent && !record.isLeave;
        if (status === 'late') return record.isLate;
        if (status === 'on-leave') return record.isLeave;
        return true;
      });
    }

    // Calculate comprehensive stats
    const totalEmployees = allUsers.length;
    const presentToday = completeAttendance.filter(a => a.isPresent).length;
    const absentToday = completeAttendance.filter(a => !a.isPresent && !a.isLeave).length;
    const lateToday = completeAttendance.filter(a => a.isLate).length;
    const onLeaveToday = completeAttendance.filter(a => a.isLeave).length;
    const onTimeToday = presentToday - lateToday;
    const dayStartedCount = completeAttendance.filter(a => a.startDayTime).length;
    const dayEndedCount = completeAttendance.filter(a => a.endDayTime).length;
    const pausedCount = completeAttendance.filter(a => a.workSession && a.workSession.status === 'paused').length;
    const activeWorkingCount = completeAttendance.filter(a => a.workSession && a.workSession.status === 'active').length;

    const totalHoursToday = completeAttendance.reduce((sum, a) => sum + (a.hoursWorked || 0), 0);
    const avgHoursToday = presentToday > 0 ? Math.round((totalHoursToday / presentToday) * 100) / 100 : 0;

    const stats = {
      totalEmployees,
      presentToday,
      absentToday,
      lateToday,
      onLeaveToday,
      onTimeToday,
      dayStartedCount,
      dayEndedCount,
      pausedCount,
      activeWorkingCount,
      presentPercentage: totalEmployees > 0 ? Math.round((presentToday / totalEmployees) * 100 * 10) / 10 : 0,
      absentPercentage: totalEmployees > 0 ? Math.round((absentToday / totalEmployees) * 100 * 10) / 10 : 0,
      onTimePercentage: presentToday > 0 ? Math.round((onTimeToday / presentToday) * 100 * 10) / 10 : 0,
      avgHoursToday,
      totalHoursToday: Math.round(totalHoursToday * 100) / 100
    };

    res.json({
      success: true,
      data: {
        attendance: filteredAttendance,
        stats,
        date: targetDate.toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error('Get live attendance error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch live attendance data',
      details: error.message
    });
  }
});

// Upload and process biometric Excel file
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'No file uploaded' 
      });
    }

    console.log('📁 Processing biometric file:', req.file.originalname);

    const BiometricUpload = require('../models/BiometricUpload');
    
    // Read the Excel file
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(req.file.path);
    
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      fs.unlinkSync(req.file.path); // Clean up
      return res.status(400).json({ 
        success: false,
        error: 'No data found in Excel file' 
      });
    }

    const attendanceData = [];
    const preview = [];
    const errors = [];
    let dateRange = { start: null, end: null };
    
    // Process each row (skip header)
    let rowNumber = 0;
    worksheet.eachRow((row, index) => {
      if (index === 1) {
        // Store headers
        return;
      }
      
      rowNumber++;
      
      try {
        const employeeId = row.getCell(1).value?.toString().trim();
        const dateValue = row.getCell(2).value;
        const timeIn = row.getCell(3).value;
        const timeOut = row.getCell(4).value;
        const deviceId = row.getCell(5).value?.toString() || 'Unknown';
        const location = row.getCell(6).value?.toString() || 'Main Office';
        
        if (!employeeId || !dateValue) {
          errors.push(`Row ${rowNumber}: Missing employee ID or date`);
          return;
        }
        
        // Parse date
        let attendanceDate;
        if (dateValue instanceof Date) {
          attendanceDate = dateValue;
        } else if (typeof dateValue === 'number') {
          // Excel date serial number
          attendanceDate = new Date((dateValue - 25569) * 86400 * 1000);
        } else {
          attendanceDate = new Date(dateValue);
        }
        
        if (isNaN(attendanceDate.getTime())) {
          errors.push(`Row ${rowNumber}: Invalid date format`);
          return;
        }
        
        // Parse times
        const parseTime = (timeValue, date) => {
          if (!timeValue) return null;
          
          if (timeValue instanceof Date) {
            return timeValue;
          }
          
          if (typeof timeValue === 'number') {
            // Excel time serial (fraction of day)
            const hours = Math.floor(timeValue * 24);
            const minutes = Math.floor((timeValue * 24 * 60) % 60);
            const resultDate = new Date(date);
            resultDate.setHours(hours, minutes, 0, 0);
            return resultDate;
          }
          
          if (typeof timeValue === 'string') {
            const timeParts = timeValue.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
            if (timeParts) {
              const resultDate = new Date(date);
              resultDate.setHours(
                parseInt(timeParts[1]), 
                parseInt(timeParts[2]), 
                parseInt(timeParts[3] || '0'), 
                0
              );
              return resultDate;
            }
          }
          
          return null;
        };
        
        const parsedTimeIn = parseTime(timeIn, attendanceDate);
        const parsedTimeOut = parseTime(timeOut, attendanceDate);
        
        // Calculate hours
        let hours = 0;
        if (parsedTimeIn && parsedTimeOut) {
          hours = (parsedTimeOut - parsedTimeIn) / (1000 * 60 * 60);
          if (hours < 0) hours = 0;
        }
        
        const record = {
          employeeId,
          date: attendanceDate.toISOString().split('T')[0],
          timeIn: parsedTimeIn ? parsedTimeIn.toISOString() : null,
          timeOut: parsedTimeOut ? parsedTimeOut.toISOString() : null,
          hours: Math.round(hours * 100) / 100,
          deviceId,
          location
        };
        
        attendanceData.push(record);
        
        // Update date range
        if (!dateRange.start || attendanceDate < new Date(dateRange.start)) {
          dateRange.start = attendanceDate.toISOString().split('T')[0];
        }
        if (!dateRange.end || attendanceDate > new Date(dateRange.end)) {
          dateRange.end = attendanceDate.toISOString().split('T')[0];
        }
        
        // Add to preview (first 10 records)
        if (preview.length < 10) {
          preview.push(record);
        }
        
      } catch (error) {
        console.error(`Error processing row ${rowNumber}:`, error);
        errors.push(`Row ${rowNumber}: ${error.message}`);
      }
    });
    
    // Create biometric upload record
    const biometricRecord = new BiometricUpload({
      uploadDate: new Date(),
      fileName: req.file.filename,
      originalFileName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      processedBy: req.user.id,
      totalRecords: attendanceData.length,
      status: 'Pending Review',
      preview: {
        headers: ['Employee ID', 'Date', 'Time In', 'Time Out', 'Device ID', 'Location'],
        sampleRows: preview,
        totalRows: attendanceData.length,
        detectedFormat: 'Standard'
      },
      summary: {
        dateRange: {
          start: dateRange.start ? new Date(dateRange.start) : null,
          end: dateRange.end ? new Date(dateRange.end) : null
        }
      },
      errorLog: errors.map((err, idx) => ({
        row: idx + 1,
        error: err,
        timestamp: new Date()
      }))
    });
    
    await biometricRecord.save();
    
    // Store processed data temporarily (you might want to use a cache or session storage)
    // For now, we'll include it in the response
    
    console.log(`✅ Processed ${attendanceData.length} records from ${req.file.originalname}`);
    
    res.json({
      success: true,
      message: `Processed ${attendanceData.length} attendance records`,
      preview: preview,
      analysis: {
        totalRecords: attendanceData.length,
        dateRange: dateRange.start && dateRange.end ? 
          `${dateRange.start} to ${dateRange.end}` : 'N/A',
        errors: errors.length,
        fileId: biometricRecord._id
      },
      fileId: biometricRecord._id
    });

  } catch (error) {
    console.error('Biometric upload error:', error);
    
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to process biometric file' 
    });
  }
});

// Confirm and import biometric upload
router.post('/confirm-upload', auth, async (req, res) => {
  try {
    const { fileId, applyChanges } = req.body;
    
    if (!fileId) {
      return res.status(400).json({ 
        success: false,
        error: 'File ID is required' 
      });
    }
    
    const BiometricUpload = require('../models/BiometricUpload');
    const biometricRecord = await BiometricUpload.findById(fileId);
    
    if (!biometricRecord) {
      return res.status(404).json({ 
        success: false,
        error: 'Upload record not found' 
      });
    }
    
    if (!applyChanges) {
      // Just mark as reviewed
      biometricRecord.status = 'Completed';
      biometricRecord.approvalStatus = 'Rejected';
      biometricRecord.rejectionReason = 'User cancelled import';
      await biometricRecord.save();
      
      return res.json({
        success: true,
        message: 'Upload cancelled',
        imported: 0
      });
    }
    
    // Re-read and process the file
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(biometricRecord.filePath);
    
    const worksheet = workbook.getWorksheet(1);
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    
    worksheet.eachRow(async (row, index) => {
      if (index === 1) return; // Skip header
      
      try {
        const employeeId = row.getCell(1).value?.toString().trim();
        const dateValue = row.getCell(2).value;
        const timeIn = row.getCell(3).value;
        const timeOut = row.getCell(4).value;
        
        if (!employeeId || !dateValue) {
          skipped++;
          return;
        }
        
        // Find user by employee ID
        const user = await User.findOne({ employeeId: employeeId });
        if (!user) {
          console.log(`User not found for employee ID: ${employeeId}`);
          skipped++;
          return;
        }
        
        // Parse date and times (same logic as before)
        let attendanceDate;
        if (dateValue instanceof Date) {
          attendanceDate = dateValue;
        } else if (typeof dateValue === 'number') {
          attendanceDate = new Date((dateValue - 25569) * 86400 * 1000);
        } else {
          attendanceDate = new Date(dateValue);
        }
        
        attendanceDate.setHours(0, 0, 0, 0);
        
        // Check if attendance already exists
        let existingAttendance = await Attendance.findOne({
          user: user._id,
          date: attendanceDate
        });
        
        if (existingAttendance) {
          // Update existing
          existingAttendance.biometricData = {
            timeIn: timeIn,
            timeOut: timeOut,
            uploadedAt: new Date()
          };
          await existingAttendance.save();
          updated++;
        } else {
          // Create new attendance record
          await Attendance.create({
            user: user._id,
            date: attendanceDate,
            status: 'Present',
            biometricData: {
              timeIn: timeIn,
              timeOut: timeOut,
              uploadedAt: new Date()
            }
          });
          imported++;
        }
        
      } catch (error) {
        console.error(`Error importing row ${index}:`, error);
        skipped++;
      }
    });
    
    // Update biometric record
    biometricRecord.status = 'Completed';
    biometricRecord.approvalStatus = 'Approved';
    biometricRecord.approvedBy = req.user.id;
    biometricRecord.approvedAt = new Date();
    biometricRecord.newRecords = imported;
    biometricRecord.updatedRecords = updated;
    await biometricRecord.save();
    
    res.json({
      success: true,
      message: `Successfully imported ${imported} new records and updated ${updated} records`,
      imported,
      updated,
      skipped
    });
    
  } catch (error) {
    console.error('Confirm upload error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to confirm upload' 
    });
  }
});

module.exports = router;