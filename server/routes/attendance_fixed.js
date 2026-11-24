const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const geolib = require('geolib');
const Attendance = require('../models/Attendance');
const BiometricUpload = require('../models/BiometricUpload');
const User = require('../models/User');
const UserTag = require('../models/UserTag');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const excelProcessor = require('../services/excelProcessor');

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

// Office coordinates from environment variables - Blackhole Infiverse LLP Mumbai
const OFFICE_COORDINATES = {
  latitude: parseFloat(process.env.OFFICE_LAT) || 19.1628987,
  longitude: parseFloat(process.env.OFFICE_LNG) || 72.8355871
};
const OFFICE_RADIUS = parseInt(process.env.OFFICE_RADIUS) || 100; // meters
const MAX_WORKING_HOURS = parseInt(process.env.MAX_WORKING_HOURS) || 8;
const AUTO_END_DAY_ENABLED = process.env.AUTO_END_DAY_ENABLED === 'true';

// Get today's attendance for a specific user
router.get('/today/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Verify user authorization
    if (req.user.id !== userId && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      user: userId,
      date: today
    }).populate('user', 'name email avatar hourlyRate');

    if (!attendance) {
      return res.json({
        success: true,
        data: {
          hasStarted: false,
          hasEnded: false,
          canStartDay: true,
          canEndDay: false,
          status: 'Not Started',
          message: 'Ready to start your day!',
          currentHours: 0,
          totalHours: 0,
          earnedAmount: 0
        }
      });
    }

    const hasStarted = !!attendance.startDayTime;
    const hasEnded = !!attendance.endDayTime;
    const canStartDay = !hasStarted;
    const canEndDay = hasStarted && !hasEnded;

    let currentHours = 0;
    if (hasStarted && !hasEnded) {
      const now = new Date();
      currentHours = (now - attendance.startDayTime) / (1000 * 60 * 60);
    }

    const totalHours = attendance.hoursWorked || 0;
    let hourlyRate = attendance.user?.hourlyRate;
    if (hourlyRate === undefined) {
      const u = await User.findById(userId).select('hourlyRate').lean();
      hourlyRate = u?.hourlyRate || 25;
    }
    const earnedAmount = totalHours * (hourlyRate || 0);

    let status = 'Not Started';
    let message = 'Ready to start your day!';

    if (hasEnded) {
      status = 'Completed';
      message = `Day completed! You worked ${totalHours.toFixed(1)} hours today.`;
    } else if (hasStarted) {
      status = 'Present';
      message = 'You are currently working. Keep it up!';
    }

    res.json({
      success: true,
      data: {
        hasStarted,
        hasEnded,
        canStartDay,
        canEndDay,
        status,
        message,
        currentHours: Math.round(currentHours * 100) / 100,
        totalHours: Math.round(totalHours * 100) / 100,
        earnedAmount: Math.round(earnedAmount * 100) / 100,
        startTime: attendance.startDayTime,
        endTime: attendance.endDayTime,
        attendanceId: attendance._id
      }
    });

  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({ error: 'Failed to fetch today attendance' });
  }
});

// Upload and process biometric Excel file
router.post('/upload', auth, upload.single('excelFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No Excel file uploaded' });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    
    const worksheet = workbook.getWorksheet(1);
    const attendanceData = [];
    const errors = [];
    
    // Process each row (skip header)
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header
      
      try {
        const employeeId = row.getCell(1).value;
        const date = new Date(row.getCell(2).value);
        const timeIn = row.getCell(3).value;
        const timeOut = row.getCell(4).value;
        const deviceId = row.getCell(5).value || 'Unknown';
        const location = row.getCell(6).value || 'Main Office';
        
        if (!employeeId || !date) {
          errors.push(`Row ${rowNumber}: Missing employee ID or date`);
          return;
        }
        
        // Parse time values
        let biometricTimeIn, biometricTimeOut;
        
        if (timeIn) {
          if (typeof timeIn === 'string') {
            const [hours, minutes] = timeIn.split(':');
            biometricTimeIn = new Date(date);
            biometricTimeIn.setHours(parseInt(hours), parseInt(minutes), 0, 0);
          } else if (timeIn instanceof Date) {
            biometricTimeIn = new Date(date);
            biometricTimeIn.setHours(timeIn.getHours(), timeIn.getMinutes(), 0, 0);
          }
        }
        
        if (timeOut) {
          if (typeof timeOut === 'string') {
            const [hours, minutes] = timeOut.split(':');
            biometricTimeOut = new Date(date);
            biometricTimeOut.setHours(parseInt(hours), parseInt(minutes), 0, 0);
          } else if (timeOut instanceof Date) {
            biometricTimeOut = new Date(date);
            biometricTimeOut.setHours(timeOut.getHours(), timeOut.getMinutes(), 0, 0);
          }
        }
        
        attendanceData.push({
          employeeId: employeeId.toString(),
          date: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
          biometricTimeIn,
          biometricTimeOut,
          biometricDeviceId: deviceId,
          biometricLocation: location,
          source: 'Biometric'
        });
        
      } catch (error) {
        errors.push(`Row ${rowNumber}: ${error.message}`);
      }
    });
    
    // Process and save attendance data
    const processedRecords = [];
    const skippedRecords = [];
    
    for (const record of attendanceData) {
      try {
        // Find user by employee ID (assuming it's stored in a custom field or email)
        const user = await User.findOne({
          $or: [
            { email: { $regex: record.employeeId, $options: 'i' } },
            { name: { $regex: record.employeeId, $options: 'i' } }
          ]
        });
        
        if (!user) {
          skippedRecords.push({
            employeeId: record.employeeId,
            reason: 'User not found'
          });
          continue;
        }
        
        // Check if attendance record already exists
        const existingRecord = await Attendance.findOne({
          user: user._id,
          date: record.date
        });
        
        if (existingRecord) {
          // Update existing record with biometric data
          existingRecord.biometricTimeIn = record.biometricTimeIn;
          existingRecord.biometricTimeOut = record.biometricTimeOut;
          existingRecord.biometricDeviceId = record.biometricDeviceId;
          existingRecord.biometricLocation = record.biometricLocation;
          
          if (existingRecord.source === 'StartDay') {
            existingRecord.source = 'Both';
          } else {
            existingRecord.source = 'Biometric';
          }
          
          await existingRecord.save();
          processedRecords.push({
            employeeId: record.employeeId,
            userName: user.name,
            date: record.date,
            action: 'Updated'
          });
        } else {
          // Create new attendance record
          const newAttendance = new Attendance({
            user: user._id,
            date: record.date,
            biometricTimeIn: record.biometricTimeIn,
            biometricTimeOut: record.biometricTimeOut,
            biometricDeviceId: record.biometricDeviceId,
            biometricLocation: record.biometricLocation,
            source: 'Biometric'
          });
          
          await newAttendance.save();
          processedRecords.push({
            employeeId: record.employeeId,
            userName: user.name,
            date: record.date,
            action: 'Created'
          });
        }
        
      } catch (error) {
        skippedRecords.push({
          employeeId: record.employeeId,
          reason: error.message
        });
      }
    }
    
    // Emit socket event for real-time updates
    if (req.io) {
      req.io.emit('attendance:excel-processed', {
        processed: processedRecords.length,
        skipped: skippedRecords.length,
        errors: errors.length
      });
    }
    
    res.json({
      success: true,
      message: 'Excel file processed successfully',
      summary: {
        totalRows: attendanceData.length,
        processed: processedRecords.length,
        skipped: skippedRecords.length,
        errors: errors.length
      },
      details: {
        processedRecords,
        skippedRecords,
        errors
      }
    });
    
  } catch (error) {
    console.error('Excel processing error:', error);
    res.status(500).json({ 
      error: 'Failed to process Excel file',
      details: error.message 
    });
  }
});

// Start day with enhanced geolocation validation
router.post('/start-day/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { latitude, longitude, address, accuracy } = req.body;

    // Verify user authorization
    if (req.user.id !== userId && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Validate geolocation
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Geolocation data required' });
    }

    // Get user's location restrictions from UserTag
    const UserTag = require('../models/UserTag');
    const userTag = await UserTag.findOne({ user: userId });

    let allowedRadius = OFFICE_RADIUS;
    let allowRemote = false;
    let strictLocationCheck = true;
    let allowedLocations = [];

    if (userTag && userTag.locationRestrictions) {
      allowedRadius = userTag.locationRestrictions.officeRadius || OFFICE_RADIUS;
      allowRemote = userTag.locationRestrictions.allowRemote || false;
      strictLocationCheck = userTag.locationRestrictions.strictLocationCheck !== false;
      allowedLocations = userTag.locationRestrictions.allowedLocations || [];
    }

    // Skip location check if remote work is allowed and not strict
    let distance = 0;
    if (allowRemote && !strictLocationCheck) {
      // Allow start day from anywhere
    } else {
      // Check primary office location
      const distanceFromOffice = geolib.getDistance(
        { latitude: OFFICE_COORDINATES.latitude, longitude: OFFICE_COORDINATES.longitude },
        { latitude, longitude }
      );

      distance = distanceFromOffice;
      let isWithinAllowedLocation = distanceFromOffice <= allowedRadius;

      // Check additional allowed locations
      if (!isWithinAllowedLocation && allowedLocations.length > 0) {
        for (const location of allowedLocations) {
          const distance = geolib.getDistance(
            { latitude: location.latitude, longitude: location.longitude },
            { latitude, longitude }
          );
          if (distance <= (location.radius || allowedRadius)) {
            isWithinAllowedLocation = true;
            break;
          }
        }
      }

      if (!isWithinAllowedLocation) {
        const officeAddress = process.env.OFFICE_ADDRESS || 'Office Location';
        return res.status(400).json({
          error: `You must be within office premises to start your day. Please visit: ${officeAddress}`,
          distance: distanceFromOffice,
          allowedRadius: allowedRadius,
          officeAddress: officeAddress,
          allowRemote: allowRemote,
          userLocation: { latitude, longitude, address }
        });
      }
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Check if user has already started day
    const existingRecord = await Attendance.findOne({
      user: userId,
      date: today
    });
    
    if (existingRecord && existingRecord.startDayTime) {
      return res.status(400).json({ 
        error: 'Day already started',
        startTime: existingRecord.startDayTime
      });
    }
    
    const startTime = new Date();
    
    if (existingRecord) {
      // Update existing record
      existingRecord.startDayTime = startTime;
      existingRecord.startDayLocation = {
        latitude,
        longitude,
        address,
        accuracy
      };
      existingRecord.isPresent = true;
      
      if (existingRecord.source === 'Biometric') {
        existingRecord.source = 'Both';
      } else {
        existingRecord.source = 'StartDay';
      }
      
      await existingRecord.save();
    } else {
      // Create new record
      const newAttendance = new Attendance({
        user: userId,
        date: today,
        startDayTime: startTime,
        startDayLocation: {
          latitude,
          longitude,
          address,
          accuracy
        },
        isPresent: true,
        source: 'StartDay'
      });
      
      await newAttendance.save();
    }
    
    // Emit socket event
    if (req.io) {
      req.io.emit('attendance:day-started', {
        userId,
        startTime,
        location: { latitude, longitude, address }
      });
    }
    
    res.json({
      success: true,
      message: 'Day started successfully',
      startTime,
      location: { latitude, longitude, address },
      distanceFromOffice: distance
    });
    
  } catch (error) {
    console.error('Start day error:', error);
    res.status(500).json({ error: 'Failed to start day' });
  }
});

// End day
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
    
    const attendanceRecord = await Attendance.findOne({
      user: userId,
      date: today
    });
    
    if (!attendanceRecord || !attendanceRecord.startDayTime) {
      return res.status(400).json({ error: 'Day not started yet' });
    }
    
    if (attendanceRecord.endDayTime) {
      return res.status(400).json({ 
        error: 'Day already ended',
        endTime: attendanceRecord.endDayTime
      });
    }
    
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

    // Calculate detailed working hours BEFORE saving
    const startTime = attendanceRecord.startDayTime;
    const totalMilliseconds = endTime - startTime;
    const totalMinutes = Math.floor(totalMilliseconds / (1000 * 60));
    const hoursWorked = totalMilliseconds / (1000 * 60 * 60);

    // Update attendance record with calculated values
    attendanceRecord.hoursWorked = Math.round(hoursWorked * 100) / 100; // Round to 2 decimal places
    attendanceRecord.totalMinutesWorked = totalMinutes;
    attendanceRecord.actualEndTime = endTime;

    // Calculate overtime if applicable
    const standardHours = 8;
    if (hoursWorked > standardHours) {
      attendanceRecord.overtimeHours = Math.round((hoursWorked - standardHours) * 100) / 100;
    } else {
      attendanceRecord.overtimeHours = 0;
    }

    // Mark as verified since it's manually ended
    attendanceRecord.isVerified = true;
    attendanceRecord.approvalStatus = 'Auto-Approved';

    await attendanceRecord.save();
    
    // Emit socket event
    if (req.io) {
      req.io.emit('attendance:day-ended', {
        userId,
        endTime,
        hoursWorked: attendanceRecord.hoursWorked
      });
    }
    
    res.json({
      success: true,
      message: `Day ended successfully! You worked ${attendanceRecord.hoursWorked} hours today.`,
      data: {
        endTime,
        startTime: attendanceRecord.startDayTime,
        hoursWorked: attendanceRecord.hoursWorked,
        totalMinutesWorked: attendanceRecord.totalMinutesWorked,
        overtimeHours: attendanceRecord.overtimeHours,
        isOvertime: attendanceRecord.overtimeHours > 0,
        attendanceId: attendanceRecord._id
      }
    });

  } catch (error) {
    console.error('End day error:', error);
    res.status(500).json({ error: 'Failed to end day' });
  }
});

// Get live attendance data for dashboard
router.get('/live', auth, async (req, res) => {
  try {
    const { date, department, status } = req.query;
    const targetDate = date ? new Date(date) : new Date();

    // Set date range for the day
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Build query
    let query = {
      date: { $gte: startOfDay, $lte: endOfDay }
    };

    if (department) {
      const users = await User.find({ department }).select('_id');
      query.user = { $in: users.map(u => u._id) };
    }

    if (status) {
      if (status === 'present') {
        query.isPresent = true;
      } else if (status === 'absent') {
        query.isPresent = false;
      } else if (status === 'late') {
        query.isLate = true;
      } else if (status === 'on-leave') {
        query.isLeave = true;
      }
    }

    // Fetch attendance records with user details
    const attendance = await Attendance.find(query)
      .populate('user', 'name email avatar department')
      .sort({ updatedAt: -1 })
      .lean();

    // Calculate stats
    const totalEmployees = await User.countDocuments({ isActive: true });
    const presentToday = attendance.filter(a => a.isPresent).length;
    const absentToday = totalEmployees - presentToday;
    const lateToday = attendance.filter(a => a.isLate).length;
    const onTimeToday = presentToday - lateToday;

    const totalHoursToday = attendance.reduce((sum, a) => sum + (a.hoursWorked || 0), 0);
    const avgHoursToday = presentToday > 0 ? totalHoursToday / presentToday : 0;

    const stats = {
      totalEmployees,
      presentToday,
      absentToday,
      lateToday,
      onTimeToday,
      presentPercentage: totalEmployees > 0 ? (presentToday / totalEmployees) * 100 : 0,
      absentPercentage: totalEmployees > 0 ? (absentToday / totalEmployees) * 100 : 0,
      onTimePercentage: presentToday > 0 ? (onTimeToday / presentToday) * 100 : 0,
      avgHoursToday,
      totalHoursToday
    };

    // Format attendance data
    const formattedAttendance = attendance.map(record => ({
      ...record,
      status: record.isPresent ? (record.isLate ? 'late' : 'present') :
              record.isLeave ? 'on-leave' : 'absent',
      user: {
        ...record.user,
        tag: record.user.tag || 'Employee' // Default tag
      }
    }));

    res.json({
      success: true,
      data: {
        attendance: formattedAttendance,
        stats,
        date: targetDate.toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error('Get live attendance error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch live attendance data'
    });
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
    }).populate('user', 'name email hourlyRate');

    if (!attendance) {
      return res.json({
        success: true,
        data: {
          hasStarted: false,
          hasEnded: false,
          canStartDay: true,
          canEndDay: false,
          status: 'Not Started',
          message: 'Ready to start your day!',
          currentHours: 0,
          totalHours: 0,
          earnedAmount: 0
        }
      });
    }

    const hasStarted = !!attendance.startDayTime;
    const hasEnded = !!attendance.endDayTime;
    const canStartDay = !hasStarted;
    const canEndDay = hasStarted && !hasEnded;

    let currentHours = 0;
    if (hasStarted && !hasEnded) {
      const now = new Date();
      currentHours = (now - attendance.startDayTime) / (1000 * 60 * 60);
    }

    const totalHours = attendance.hoursWorked || 0;
    let hourlyRate = attendance.user?.hourlyRate;
    if (hourlyRate === undefined) {
      const u = await User.findById(userId).select('hourlyRate').lean();
      hourlyRate = u?.hourlyRate || 25;
    }
    const earnedAmount = totalHours * (hourlyRate || 0);

    let status = 'Not Started';
    let message = 'Ready to start your day!';

    if (hasEnded) {
      status = 'Completed';
      message = `Day completed! You worked ${totalHours.toFixed(1)} hours today.`;
    } else if (hasStarted) {
      status = 'Present';
      message = 'You are currently working. Keep it up!';
    }

    res.json({
      success: true,
      data: {
        hasStarted,
        hasEnded,
        canStartDay,
        canEndDay,
        status,
        message,
        currentHours: Math.round(currentHours * 100) / 100,
        totalHours: Math.round(totalHours * 100) / 100,
        earnedAmount: Math.round(earnedAmount * 100) / 100,
        startTime: attendance.startDayTime,
        endTime: attendance.endDayTime,
        attendanceId: attendance._id
      }
    });

  } catch (error) {
    console.error('Verify attendance error:', error);
    res.status(500).json({ error: 'Failed to verify attendance' });
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

    // Calculate stats
    const presentDays = records.filter(r => r.isPresent).length;
    const totalDays = records.length;
    const attendanceRate = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;
    const totalHours = records.reduce((sum, r) => sum + (r.hoursWorked || 0), 0);
    const avgHours = presentDays > 0 ? totalHours / presentDays : 0;

    const stats = {
      totalDays,
      presentDays,
      absentDays: totalDays - presentDays,
      attendanceRate: Math.round(attendanceRate * 100) / 100,
      totalHours: Math.round(totalHours * 100) / 100,
      avgHours: Math.round(avgHours * 100) / 100
    };

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

module.exports = router;