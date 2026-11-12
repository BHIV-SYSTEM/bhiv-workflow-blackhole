const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const DailyAttendance = require('../models/DailyAttendance');
const Attendance = require('../models/Attendance');
const NewSalaryRecord = require('../models/NewSalaryRecord');
const User = require('../models/User');
const Aim = require('../models/Aim');
const { compareBySurname, sortBySurname } = require('../utils/nameSorting');

// Helper to get branch filter from request
const getBranchQuery = (req) => {
  const selectedBranch = req.headers['x-branch'] || req.query.branch;
  if (selectedBranch && selectedBranch !== 'all') {
    return { branch: selectedBranch };
  }
  return {};
};

/**
 * ============================================
 * HOURS MANAGEMENT SECTION
 * ============================================
 */

/**
 * GET /api/new-salary/hours/all
 * Get all users with cumulative hours from AIMS for a date range
 * Query params: fromDate, toDate (ISO date strings)
 * Admin only
 */
router.get('/hours/all', auth, adminAuth, async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;

    console.log('📅 Received date filters:', { fromDate, toDate });

    // Parse date range - handle timezone issues
    let startDate, endDate;
    
    if (fromDate) {
      // Parse date string (YYYY-MM-DD format)
      const dateParts = fromDate.split('-');
      if (dateParts.length === 3) {
        const year = parseInt(dateParts[0]);
        const month = parseInt(dateParts[1]) - 1; // Month is 0-indexed
        const day = parseInt(dateParts[2]);
        
        if (isNaN(year) || isNaN(month) || isNaN(day)) {
          return res.status(400).json({
            success: false,
            error: `Invalid date format for fromDate: ${fromDate}. Please use YYYY-MM-DD format.`
          });
        }
        
        startDate = new Date(year, month, day);
        startDate.setHours(0, 0, 0, 0);
      } else {
        startDate = new Date(fromDate);
        if (isNaN(startDate.getTime())) {
          return res.status(400).json({
            success: false,
            error: `Invalid date format for fromDate: ${fromDate}. Please use YYYY-MM-DD format.`
          });
        }
        startDate.setHours(0, 0, 0, 0);
      }
    } else {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
    }
    
    if (toDate) {
      // Parse date string (YYYY-MM-DD format)
      const dateParts = toDate.split('-');
      if (dateParts.length === 3) {
        const year = parseInt(dateParts[0]);
        const month = parseInt(dateParts[1]) - 1; // Month is 0-indexed
        const day = parseInt(dateParts[2]);
        
        if (isNaN(year) || isNaN(month) || isNaN(day)) {
          return res.status(400).json({
            success: false,
            error: `Invalid date format for toDate: ${toDate}. Please use YYYY-MM-DD format.`
          });
        }
        
        endDate = new Date(year, month, day);
        endDate.setHours(23, 59, 59, 999);
      } else {
        endDate = new Date(toDate);
        if (isNaN(endDate.getTime())) {
          return res.status(400).json({
            success: false,
            error: `Invalid date format for toDate: ${toDate}. Please use YYYY-MM-DD format.`
          });
        }
        endDate.setHours(23, 59, 59, 999);
      }
    } else {
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    }

    // Validate dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Please use YYYY-MM-DD format.'
      });
    }

    if (startDate > endDate) {
      return res.status(400).json({
        success: false,
        error: 'Start date must be before end date.'
      });
    }

    console.log('📅 Parsed date range:', {
      fromDate: startDate.toISOString(),
      toDate: endDate.toISOString(),
      fromDateLocal: startDate.toLocaleString(),
      toDateLocal: endDate.toLocaleString(),
      fromDateQuery: fromDate,
      toDateQuery: toDate,
      daysInRange: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1
    });

    // Get branch filter
    const branchQuery = getBranchQuery(req);

    // Get all active users (excluding exited) - FILTERED BY BRANCH
    const allUsers = await User.find({ stillExist: 1, ...branchQuery })
      .populate('department', 'name color')
      .select('name email department employeeId role branch stillExist')
      .lean();
    
    console.log(`Found ${allUsers.length} active users`);

    if (!allUsers || allUsers.length === 0) {
      return res.json({
        success: true,
        data: {
          users: [],
          totalUsers: 0,
          totalCumulativeHours: 0,
          dateRange: {
            from: startDate.toISOString(),
            to: endDate.toISOString()
          }
        }
      });
    }

    // Filter out users who already have confirmed salaries for this date range
    // Find confirmed salary records that overlap with the selected date range
    const confirmedRecords = await NewSalaryRecord.find({
      isConfirmed: true,
      startDate: { $lte: endDate },
      endDate: { $gte: startDate }
    }).select('user startDate endDate').lean();

    // Create a set of user IDs who have confirmed salaries for the EXACT same date range
    const confirmedUserIds = new Set();
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    confirmedRecords.forEach(record => {
      const recordStartStr = new Date(record.startDate).toISOString().split('T')[0];
      const recordEndStr = new Date(record.endDate).toISOString().split('T')[0];
      
      // Check if the confirmed record matches the same date range
      if (recordStartStr === startDateStr && recordEndStr === endDateStr) {
        confirmedUserIds.add(record.user.toString());
      }
    });

    console.log(`📋 Found ${confirmedUserIds.size} users with confirmed salaries for this exact date range`);

    // Filter out confirmed users
    const users = allUsers.filter(user => !confirmedUserIds.has(user._id.toString()));
    
    console.log(`📋 ${allUsers.length - users.length} users filtered out (already confirmed)`);
    console.log(`📋 ${users.length} users remaining for salary calculation`);

    if (!users || users.length === 0) {
      return res.json({
        success: true,
        data: {
          users: [],
          totalUsers: 0,
          totalCumulativeHours: 0,
          dateRange: {
            from: startDate.toISOString(),
            to: endDate.toISOString()
          }
        }
      });
    }

    // Get all AIMS records for the date range
    // Query for aims with workSessionInfo that has totalHoursWorked
    const userIds = users.map(u => u._id);
    
    // PRIMARY SOURCE: Get DailyAttendance records (most reliable source)
    console.log(`🔍 Querying DailyAttendance for ${userIds.length} users...`);
    console.log(`   Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    // Create date range query - ensure we're using Date objects
    // EXCLUDE auto-ended records (autoEnded === true) unless validated
    // Include: (autoEnded === false) OR (autoEnded === true AND spamStatus === 'Valid')
    // Exclude: spamStatus === 'Spam'
    // Also include records with startDayTime/endDayTime even if totalHoursWorked is 0 (we'll calculate)
    const dailyAttendanceQuery = {
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      },
      user: { $in: userIds },
      // Include records with hours > 0 OR records with start/end times (we'll calculate hours)
      $or: [
        { totalHoursWorked: { $gt: 0 } },
        { startDayTime: { $exists: true }, endDayTime: { $exists: true } },
        { biometricTimeIn: { $exists: true }, biometricTimeOut: { $exists: true } }
      ],
      // Only include valid records (not auto-ended OR auto-ended but validated)
      $and: [
        {
          $or: [
            { autoEnded: { $exists: false } }, // Old records without autoEnded field
            { autoEnded: false }, // Normal records (not auto-ended)
            { autoEnded: true, spamStatus: 'Valid' } // Auto-ended but validated as valid
          ]
        },
        {
          $or: [
            { spamStatus: { $exists: false } }, // Old records without spamStatus
            { spamStatus: { $ne: 'Spam' } } // Not marked as spam
          ]
        }
      ]
    };
    
    console.log(`   Query filter:`, {
      dateRange: { 
        $gte: new Date(startDate).toISOString(), 
        $lte: new Date(endDate).toISOString() 
      },
      userCount: userIds.length,
      totalHoursWorked: { $gt: 0 }
    });
    
    const dailyAttendanceRecords = await DailyAttendance.find(dailyAttendanceQuery)
    .select('user date totalHoursWorked startDayTime endDayTime biometricTimeIn biometricTimeOut breakTime')
    .lean();
    
    console.log(`✅ Found ${dailyAttendanceRecords.length} DailyAttendance records with hours > 0`);
    
    // Log sample records for debugging
    if (dailyAttendanceRecords.length > 0) {
      console.log(`   Sample records (first 3):`);
      dailyAttendanceRecords.slice(0, 3).forEach((record, idx) => {
        console.log(`     [${idx + 1}] User: ${record.user}, Date: ${record.date ? new Date(record.date).toISOString() : 'N/A'}, Hours: ${record.totalHoursWorked}`);
      });
      
      // Verify dates are in range
      const outOfRange = dailyAttendanceRecords.filter(r => {
        const recordDate = r.date ? new Date(r.date) : null;
        if (!recordDate) return true;
        return recordDate < startDate || recordDate > endDate;
      });
      
      if (outOfRange.length > 0) {
        console.warn(`   ⚠️ WARNING: ${outOfRange.length} records found outside date range!`);
      }
    } else {
      console.log(`   ⚠️ No records found. Checking if there's any data in DailyAttendance...`);
      
      // Check if there's ANY data for these users (without date filter)
      const anyRecords = await DailyAttendance.find({
        user: { $in: userIds },
        totalHoursWorked: { $gt: 0 }
      })
      .select('user date totalHoursWorked')
      .limit(5)
      .lean();
      
      if (anyRecords.length > 0) {
        console.log(`   ℹ️ Found ${anyRecords.length} records for these users (outside date range):`);
        anyRecords.forEach((record, idx) => {
          console.log(`     [${idx + 1}] User: ${record.user}, Date: ${record.date ? new Date(record.date).toISOString() : 'N/A'}, Hours: ${record.totalHoursWorked}`);
        });
      }
    }
    
    // SECONDARY SOURCE: Get Attendance records (if DailyAttendance has no data)
    let attendanceRecords = [];
    if (dailyAttendanceRecords.length === 0) {
      console.log('⚠️ No DailyAttendance records found, checking Attendance model...');
      const attendanceQuery = {
        date: {
          $gte: startDate,
          $lte: endDate
        },
        user: { $in: userIds },
        $or: [
          { hoursWorked: { $gt: 0 } },
          { totalHoursWorked: { $gt: 0 } }
        ],
        // Only include valid records (not auto-ended OR auto-ended but validated)
        $and: [
          {
            $or: [
              { autoEnded: false },
              { autoEnded: true, spamStatus: 'Valid' }
            ]
          },
          { spamStatus: { $ne: 'Spam' } }
        ]
      };
      
      attendanceRecords = await Attendance.find(attendanceQuery)
      .select('user date hoursWorked totalHoursWorked')
      .lean();
      
      console.log(`✅ Found ${attendanceRecords.length} Attendance records with hours > 0`);
    }
    
    // TERTIARY SOURCE: Get AIMS records (only if both DailyAttendance and Attendance have no data)
    let aimsRecords = [];
    if (dailyAttendanceRecords.length === 0 && attendanceRecords.length === 0) {
      console.log('No attendance records found, checking AIMS as fallback...');
      const allAimsRecords = await Aim.find({
        date: {
          $gte: startDate,
          $lte: endDate
        },
        user: { $in: userIds }
      })
      .select('user date workSessionInfo')
      .lean();
      
      console.log(`Found ${allAimsRecords.length} total AIMS records in date range`);
      
      // Filter to only those with valid hours
      aimsRecords = allAimsRecords.filter(aim => {
        const hours = aim.workSessionInfo?.totalHoursWorked;
        return hours && hours > 0;
      });

      console.log(`Found ${aimsRecords.length} AIMS records with hours > 0`);
    }

    // Calculate cumulative hours per user
    const userHoursMap = new Map();
    // Track unique dates per user to avoid double-counting days
    const userDatesMap = new Map(); // userId -> Set of date strings

    // Initialize all users with 0 hours
    users.forEach(user => {
      const userId = user._id.toString();
      userHoursMap.set(userId, {
        userId: user._id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        department: user.department?.name || 'No Department',
        departmentColor: user.department?.color || 'bg-gray-500',
        role: user.role,
        stillExist: user.stillExist !== undefined ? user.stillExist : 1,
        cumulativeHours: 0,
        totalDays: 0
      });
      userDatesMap.set(userId, new Set());
    });

    // Helper function to normalize date to start of day for comparison
    const normalizeDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    // Helper function to get date string (YYYY-MM-DD) for comparison
    const getDateString = (date) => {
      const normalized = normalizeDate(date);
      if (!normalized) return null;
      return `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, '0')}-${String(normalized.getDate()).padStart(2, '0')}`;
    };

    // Helper function to check if date is within range (strict comparison)
    const isDateInRange = (date) => {
      if (!date) return false;
      const normalized = normalizeDate(date);
      if (!normalized) return false;
      const normalizedStart = normalizeDate(startDate);
      const normalizedEnd = normalizeDate(endDate);
      
      // Compare dates (not times) - use getTime() for accurate comparison
      const dateOnly = normalized.getTime();
      const startOnly = normalizedStart.getTime();
      const endOnly = normalizedEnd.getTime();
      
      const inRange = dateOnly >= startOnly && dateOnly <= endOnly;
      
      if (!inRange && date) {
        console.log(`   ⚠️ Date ${normalized.toISOString()} is outside range ${normalizedStart.toISOString()} to ${normalizedEnd.toISOString()}`);
      }
      
      return inRange;
    };

    // Aggregate hours from DailyAttendance (PRIMARY SOURCE - most reliable)
    let recordsProcessed = 0;
    let recordsSkipped = 0;
    let midnightSpanRecords = [];
    
    dailyAttendanceRecords.forEach(record => {
      if (!record.user) {
        recordsSkipped++;
        return;
      }
      
      const userId = record.user.toString ? record.user.toString() : record.user;
      
      // Calculate hours: use totalHoursWorked if available, otherwise calculate from times
      let hours = record.totalHoursWorked || 0;
      
      // If hours is 0 but we have start/end times, calculate hours
      if (hours === 0 || !hours) {
        let startTime = null;
        let endTime = null;
        
        // Prioritize biometric data if available
        if (record.biometricTimeIn && record.biometricTimeOut) {
          startTime = new Date(record.biometricTimeIn);
          endTime = new Date(record.biometricTimeOut);
        } else if (record.startDayTime && record.endDayTime) {
          startTime = new Date(record.startDayTime);
          endTime = new Date(record.endDayTime);
        }
        
        if (startTime && endTime) {
          // SPAN DETECTION: Check if session crosses midnight
          const startDate = new Date(startTime);
          startDate.setHours(0, 0, 0, 0);
          const endDate = new Date(endTime);
          endDate.setHours(0, 0, 0, 0);
          
          const spansMidnight = startDate.getTime() !== endDate.getTime();
          
          if (spansMidnight) {
            // Session spans across midnight - split it
            const midnight = new Date(startDate);
            midnight.setDate(midnight.getDate() + 1);
            midnight.setHours(0, 0, 0, 0);
            
            // Calculate hours for each day
            const hoursBeforeMidnight = (midnight.getTime() - startTime.getTime()) / (1000 * 60 * 60);
            const hoursAfterMidnight = (endTime.getTime() - midnight.getTime()) / (1000 * 60 * 60);
            
            // Store span info for admin validation
            midnightSpanRecords.push({
              userId,
              recordId: record._id,
              startTime: startTime,
              endTime: endTime,
              midnight: midnight,
              hoursBeforeMidnight: Math.round(hoursBeforeMidnight * 100) / 100,
              hoursAfterMidnight: Math.round(hoursAfterMidnight * 100) / 100,
              spamStatus: record.spamStatus || 'Pending Review',
              needsValidation: true
            });
            
            console.log(`⚠️ MIDNIGHT SPAN DETECTED for user ${userId}:`);
            console.log(`   Start: ${startTime.toISOString()}`);
            console.log(`   End: ${endTime.toISOString()}`);
            console.log(`   Hours before midnight: ${hoursBeforeMidnight.toFixed(2)}h`);
            console.log(`   Hours after midnight: ${hoursAfterMidnight.toFixed(2)}h`);
            
            // Use total hours but mark for admin validation
            hours = hoursBeforeMidnight + hoursAfterMidnight;
          } else {
            // Normal same-day session
            const timeDiff = endTime.getTime() - startTime.getTime();
            const breakMinutes = record.breakTime || 0;
            hours = Math.max(0, (timeDiff / (1000 * 60 * 60)) - (breakMinutes / 60));
          }
          
          hours = Math.round(hours * 100) / 100; // Round to 2 decimal places
        }
      }
      
      const dateStr = getDateString(record.date);
      
      // Double-check date is in range (even though query should have filtered it)
      if (!isDateInRange(record.date)) {
        recordsSkipped++;
        return;
      }
      
      if (userHoursMap.has(userId) && hours > 0 && dateStr) {
        const userData = userHoursMap.get(userId);
        const userDates = userDatesMap.get(userId);
        
        // Only count unique dates
        if (!userDates.has(dateStr)) {
          userData.cumulativeHours += hours;
          userData.totalDays += 1;
          userDates.add(dateStr);
          recordsProcessed++;
          console.log(`   ✅ Added ${hours} hrs for user ${userId} on ${dateStr}`);
        } else {
          recordsSkipped++;
        }
      } else {
        if (hours === 0) {
          console.log(`   ⚠️ Skipping record with 0 hours for user ${userId} on ${dateStr}`);
        }
        recordsSkipped++;
      }
    });
    
    console.log(`📊 DailyAttendance aggregation: ${recordsProcessed} processed, ${recordsSkipped} skipped`);
    
    // Aggregate hours from Attendance (SECONDARY SOURCE - only if DailyAttendance had no data)
    if (dailyAttendanceRecords.length === 0) {
      attendanceRecords.forEach(record => {
        if (!record.user) return;
        const userId = record.user.toString ? record.user.toString() : record.user;
        const hours = record.totalHoursWorked || record.hoursWorked || 0;
        const dateStr = getDateString(record.date);
        
        if (userHoursMap.has(userId) && hours > 0 && isDateInRange(record.date) && dateStr) {
          const userData = userHoursMap.get(userId);
          const userDates = userDatesMap.get(userId);
          
          // Only count unique dates
          if (!userDates.has(dateStr)) {
            userData.cumulativeHours += hours;
            userData.totalDays += 1;
            userDates.add(dateStr);
          }
        }
      });
      
      console.log(`Aggregated hours from Attendance model (secondary source)`);
    }
    
    // Aggregate hours from AIMS (TERTIARY SOURCE - only if both DailyAttendance and Attendance had no data)
    if (dailyAttendanceRecords.length === 0 && attendanceRecords.length === 0) {
      aimsRecords.forEach(aim => {
        if (!aim.user) return;
        
        const userId = aim.user.toString ? aim.user.toString() : aim.user;
        const hours = aim.workSessionInfo?.totalHoursWorked || 0;
        const dateStr = getDateString(aim.date);
        
        if (userHoursMap.has(userId) && hours > 0 && isDateInRange(aim.date) && dateStr) {
          const userData = userHoursMap.get(userId);
          const userDates = userDatesMap.get(userId);
          
          // Only count unique dates
          if (!userDates.has(dateStr)) {
            userData.cumulativeHours += hours;
            userData.totalDays += 1;
            userDates.add(dateStr);
          }
        }
      });
      
      console.log(`Aggregated hours from AIMS model (tertiary source)`);
    } else {
      console.log(`Aggregated hours from DailyAttendance model (primary source)`);
    }
    
    // Validate: totalDays should not exceed the number of days in the date range
    const maxDaysInRange = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    console.log(`Date range: ${maxDaysInRange} days (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]})`);

    // Convert map to array and sort alphabetically by surname (last name)
    const usersWithHours = Array.from(userHoursMap.values())
      .map(user => ({
        ...user,
        cumulativeHours: Math.round(user.cumulativeHours * 100) / 100
      }))
      .sort(compareBySurname);
    
    // Log any users with days exceeding the range (indicates data issue)
    usersWithHours.forEach(user => {
      if (user.totalDays > maxDaysInRange) {
        console.warn(`⚠️ DATA ISSUE: User ${user.name} has ${user.totalDays} days but date range only has ${maxDaysInRange} days. This may indicate duplicate records or incorrect date filtering.`);
      }
    });

    const totalCumulativeHours = usersWithHours.reduce((sum, user) => sum + user.cumulativeHours, 0);
    
    // Log summary
    const usersWithData = usersWithHours.filter(u => u.cumulativeHours > 0).length;
    console.log(`📊 Summary:`);
    console.log(`   Total users: ${usersWithHours.length}`);
    console.log(`   Users with hours: ${usersWithData}`);
    console.log(`   Total cumulative hours: ${Math.round(totalCumulativeHours * 100) / 100}`);
    console.log(`   Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

    res.json({
      success: true,
      data: {
        users: usersWithHours,
        totalUsers: usersWithHours.length,
        totalCumulativeHours: Math.round(totalCumulativeHours * 100) / 100,
        dateRange: {
          from: startDate.toISOString(),
          to: endDate.toISOString()
        },
        filterApplied: {
          fromDate: fromDate || null,
          toDate: toDate || null
        }
      }
    });
  } catch (error) {
    console.error('Error fetching all users hours:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch users hours data',
      details: error.message 
    });
  }
});

/**
 * GET /api/new-salary/debug/attendance
 * Debug endpoint to show actual attendance records in database
 * Query params: fromDate, toDate (ISO date strings)
 * Admin only - FILTERED BY BRANCH
 */
router.get('/debug/attendance', auth, adminAuth, async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const branchQuery = getBranchQuery(req);

    // Parse date range
    let startDate, endDate;
    
    if (fromDate) {
      startDate = new Date(fromDate);
      if (fromDate.length === 10) {
        startDate.setHours(0, 0, 0, 0);
      }
    } else {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
    }
    
    if (toDate) {
      endDate = new Date(toDate);
      if (toDate.length === 10) {
        endDate.setHours(23, 59, 59, 999);
      }
    } else {
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    }

    // Get all active users - FILTERED BY BRANCH
    const users = await User.find({ stillExist: 1, ...branchQuery })
      .select('_id name email employeeId branch')
      .lean();

    const userIds = users.map(u => u._id);

    // Query AIMS
    const aimsRecords = await Aim.find({
      date: { $gte: startDate, $lte: endDate },
      user: { $in: userIds }
    })
    .select('user date workSessionInfo aims')
    .populate('user', 'name email')
    .lean();

    // Query DailyAttendance
    const dailyAttendanceRecords = await DailyAttendance.find({
      date: { $gte: startDate, $lte: endDate },
      user: { $in: userIds }
    })
    .select('user date startDayTime endDayTime totalHoursWorked biometricTimeIn biometricTimeOut')
    .populate('user', 'name email')
    .lean();

    // Query Attendance
    const attendanceRecords = await Attendance.find({
      date: { $gte: startDate, $lte: endDate },
      user: { $in: userIds }
    })
    .select('user date startDayTime endDayTime hoursWorked totalHoursWorked biometricTimeIn biometricTimeOut')
    .populate('user', 'name email')
    .lean();

    // Count records with hours
    const aimsWithHours = aimsRecords.filter(a => a.workSessionInfo?.totalHoursWorked > 0).length;
    const dailyAttWithHours = dailyAttendanceRecords.filter(a => a.totalHoursWorked > 0).length;
    const attWithHours = attendanceRecords.filter(a => (a.hoursWorked > 0 || a.totalHoursWorked > 0)).length;

    res.json({
      success: true,
      data: {
        dateRange: {
          from: startDate.toISOString(),
          to: endDate.toISOString()
        },
        summary: {
          totalUsers: users.length,
          aimsRecords: {
            total: aimsRecords.length,
            withHours: aimsWithHours
          },
          dailyAttendanceRecords: {
            total: dailyAttendanceRecords.length,
            withHours: dailyAttWithHours
          },
          attendanceRecords: {
            total: attendanceRecords.length,
            withHours: attWithHours
          }
        },
        sampleData: {
          aims: aimsRecords.slice(0, 5).map(a => ({
            userName: a.user?.name || 'Unknown',
            date: a.date,
            hasWorkSessionInfo: !!a.workSessionInfo,
            totalHoursWorked: a.workSessionInfo?.totalHoursWorked || 0,
            aims: a.aims?.substring(0, 50) + '...'
          })),
          dailyAttendance: dailyAttendanceRecords.slice(0, 5).map(a => ({
            userName: a.user?.name || 'Unknown',
            date: a.date,
            startDayTime: a.startDayTime,
            endDayTime: a.endDayTime,
            totalHoursWorked: a.totalHoursWorked || 0,
            biometricTimeIn: a.biometricTimeIn,
            biometricTimeOut: a.biometricTimeOut
          })),
          attendance: attendanceRecords.slice(0, 5).map(a => ({
            userName: a.user?.name || 'Unknown',
            date: a.date,
            startDayTime: a.startDayTime,
            endDayTime: a.endDayTime,
            hoursWorked: a.hoursWorked || 0,
            totalHoursWorked: a.totalHoursWorked || 0
          }))
        },
        allRecords: {
          aims: aimsRecords,
          dailyAttendance: dailyAttendanceRecords,
          attendance: attendanceRecords
        }
      }
    });
  } catch (error) {
    console.error('Error fetching debug attendance data:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch debug attendance data',
      details: error.message 
    });
  }
});

/**
 * GET /api/new-salary/hours/:userId
 * Get date-wise attendance hours for an employee
 * Query params: fromDate, toDate (ISO date strings)
 */
router.get('/hours/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { fromDate, toDate } = req.query;

    // Verify authorization
    if (req.user.id !== userId && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Parse date range - handle both YYYY-MM-DD and other formats
    let startDate, endDate;
    
    if (fromDate) {
      startDate = new Date(fromDate);
      // If date string doesn't include time, set to start of day
      if (fromDate.length === 10) {
        startDate.setHours(0, 0, 0, 0);
      }
    } else {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
    }
    
    if (toDate) {
      endDate = new Date(toDate);
      // If date string doesn't include time, set to end of day
      if (toDate.length === 10) {
        endDate.setHours(23, 59, 59, 999);
      }
    } else {
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    }

    console.log('Querying hours for:', {
      userId,
      fromDate: startDate.toISOString(),
      toDate: endDate.toISOString(),
      fromDateQuery: fromDate,
      toDateQuery: toDate
    });

    // Fetch from DailyAttendance first (primary source)
    // EXCLUDE auto-ended records unless validated
    let dailyAttendanceQuery = {
      user: userId,
      date: {
        $gte: startDate,
        $lte: endDate
      },
      $or: [
        { startDayTime: { $exists: true } },
        { biometricTimeIn: { $exists: true } },
        { totalHoursWorked: { $gt: 0 } }
      ],
      // Only include valid records (not auto-ended OR auto-ended but validated)
      $and: [
        {
          $or: [
            { autoEnded: false },
            { autoEnded: true, spamStatus: 'Valid' }
          ]
        },
        { spamStatus: { $ne: 'Spam' } }
      ]
    };
    
    console.log('DailyAttendance query (with hours):', JSON.stringify(dailyAttendanceQuery, null, 2));
    
    let attendanceRecords = await DailyAttendance.find(dailyAttendanceQuery)
    .sort({ date: -1 })
    .select('date startDayTime endDayTime biometricTimeIn biometricTimeOut totalHoursWorked hoursWorked status');
    
    console.log(`DailyAttendance found: ${attendanceRecords.length} records`);
    
    // If still no records, try without the $or condition (just date range)
    if (attendanceRecords.length === 0) {
      console.log('Trying without hours requirement...');
      dailyAttendanceQuery = {
        user: userId,
        date: {
          $gte: startDate,
          $lte: endDate
        }
      };
      
      attendanceRecords = await DailyAttendance.find(dailyAttendanceQuery)
      .sort({ date: -1 })
      .select('date startDayTime endDayTime biometricTimeIn biometricTimeOut totalHoursWorked hoursWorked status');
      
      console.log(`DailyAttendance (without hours requirement) found: ${attendanceRecords.length} records`);
    }

    // If no records in DailyAttendance, try Attendance model
    if (attendanceRecords.length === 0) {
      console.log('No records in DailyAttendance, checking Attendance model...');
      
      // Try with hours requirement first
      let attendanceQuery = {
        user: userId,
        date: {
          $gte: startDate,
          $lte: endDate
        },
        $or: [
          { startDayTime: { $exists: true } },
          { biometricTimeIn: { $exists: true } },
          { hoursWorked: { $gt: 0 } }
        ]
      };
      
      console.log('Attendance query (with hours):', JSON.stringify(attendanceQuery, null, 2));
      
      let attendanceFromAttendance = await Attendance.find(attendanceQuery)
      .sort({ date: -1 })
      .select('date startDayTime endDayTime biometricTimeIn biometricTimeOut hoursWorked totalHoursWorked status');
      
      console.log(`Attendance model found: ${attendanceFromAttendance.length} records`);
      
      // If still no records, try without $or condition
      if (attendanceFromAttendance.length === 0) {
        console.log('Trying Attendance without hours requirement...');
        attendanceQuery = {
          user: userId,
          date: {
            $gte: startDate,
            $lte: endDate
          },
          // Only include valid records (not auto-ended OR auto-ended but validated)
          $and: [
            {
              $or: [
                { autoEnded: false },
                { autoEnded: true, spamStatus: 'Valid' }
              ]
            },
            { spamStatus: { $ne: 'Spam' } }
          ]
        };
        
        attendanceFromAttendance = await Attendance.find(attendanceQuery)
        .sort({ date: -1 })
        .select('date startDayTime endDayTime biometricTimeIn biometricTimeOut hoursWorked totalHoursWorked status');
        
        console.log(`Attendance (without hours requirement) found: ${attendanceFromAttendance.length} records`);
      }

      // Convert Attendance records to match DailyAttendance format
      attendanceRecords = attendanceFromAttendance.map(record => ({
        date: record.date,
        startDayTime: record.startDayTime,
        endDayTime: record.endDayTime,
        biometricTimeIn: record.biometricTimeIn,
        biometricTimeOut: record.biometricTimeOut,
        totalHoursWorked: record.totalHoursWorked || record.hoursWorked || 0,
        status: record.status || 'Present'
      }));
    }

    console.log(`Total found: ${attendanceRecords.length} attendance records`);
    
    if (attendanceRecords.length > 0) {
      console.log('Sample record:', {
        date: attendanceRecords[0].date,
        startDayTime: attendanceRecords[0].startDayTime,
        endDayTime: attendanceRecords[0].endDayTime,
        totalHoursWorked: attendanceRecords[0].totalHoursWorked
      });
    }

    // Format response
    const hoursData = attendanceRecords.map(record => {
      const checkIn = record.startDayTime || record.biometricTimeIn;
      const checkOut = record.endDayTime || record.biometricTimeOut;
      
      // Calculate hours if not already calculated
      let dailyHours = record.totalHoursWorked || record.hoursWorked || 0;
      
      // If hours not set but we have check-in and check-out, calculate it
      if (dailyHours === 0 && checkIn && checkOut) {
        const start = new Date(checkIn);
        const end = new Date(checkOut);
        const diffMs = end - start;
        dailyHours = Math.max(0, diffMs / (1000 * 60 * 60)); // Convert to hours
      }

      return {
        date: record.date,
        checkIn: checkIn ? new Date(checkIn).toISOString() : null,
        checkOut: checkOut ? new Date(checkOut).toISOString() : null,
        dailyHours: Math.round(dailyHours * 100) / 100,
        status: record.status || 'Present'
      };
    });

    // Calculate cumulative total
    const cumulativeTotal = hoursData.reduce((sum, record) => sum + record.dailyHours, 0);

    res.json({
      success: true,
      data: {
        hoursData,
        cumulativeTotal: Math.round(cumulativeTotal * 100) / 100,
        dateRange: {
          from: startDate.toISOString(),
          to: endDate.toISOString()
        },
        totalDays: hoursData.length,
        midnightSpans: midnightSpanRecords.length > 0 ? {
          count: midnightSpanRecords.length,
          records: midnightSpanRecords,
          warning: 'Sessions spanning midnight require admin validation for fixed 8-hour allocation'
        } : null
      }
    });
  } catch (error) {
    console.error('Error fetching hours:', error);
    res.status(500).json({ error: 'Failed to fetch hours data' });
  }
});

/**
 * ============================================
 * SALARY CALCULATION SECTION
 * ============================================
 */

/**
 * POST /api/new-salary/validate-midnight-span/:recordId
 * Admin validates midnight span record - grants fixed 8 hours
 */
router.post('/validate-midnight-span/:recordId', auth, adminAuth, async (req, res) => {
  try {
    const { recordId } = req.params;
    const { reason, notes } = req.body;

    // Find the attendance record
    const record = await DailyAttendance.findById(recordId).populate('user', 'name email');
    
    if (!record) {
      return res.status(404).json({ 
        success: false,
        error: 'Record not found' 
      });
    }

    // Calculate actual hours if needed
    let actualHours = record.totalHoursWorked || 0;
    
    if (actualHours === 0 && record.startDayTime && record.endDayTime) {
      const startTime = new Date(record.startDayTime);
      const endTime = new Date(record.endDayTime);
      actualHours = (endTime - startTime) / (1000 * 60 * 60);
    }

    // FIXED 8 HOURS for midnight span validation
    const validatedHours = 8;

    // Update record
    record.totalHoursWorked = validatedHours;
    record.spamStatus = 'Valid';
    record.validatedBy = req.user.id;
    record.validatedAt = new Date();
    record.validationReason = reason || 'Admin validated midnight span session';
    record.validationNotes = notes || '';
    record.systemNotes = `Midnight span validated. Actual: ${actualHours.toFixed(2)}h → Fixed: ${validatedHours}h`;

    await record.save();

    // Also update Attendance record if exists
    const attendanceRecord = await Attendance.findOne({
      user: record.user._id,
      date: record.date
    });

    if (attendanceRecord) {
      attendanceRecord.hoursWorked = validatedHours;
      attendanceRecord.spamStatus = 'Valid';
      attendanceRecord.validatedBy = req.user.id;
      attendanceRecord.validatedAt = new Date();
      attendanceRecord.systemNotes = `Midnight span validated: ${validatedHours}h fixed`;
      await attendanceRecord.save();
    }

    console.log(`✅ Validated midnight span for ${record.user.name}: ${actualHours.toFixed(2)}h → ${validatedHours}h`);

    res.json({
      success: true,
      message: `Validated midnight span session - User receives ${validatedHours} fixed hours`,
      data: {
        recordId: record._id,
        userId: record.user._id,
        userName: record.user.name,
        actualHours: Math.round(actualHours * 100) / 100,
        validatedHours: validatedHours,
        rule: 'Midnight span validation always grants 8 fixed hours',
        validatedBy: req.user.name || req.user.email,
        validatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Validate midnight span error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to validate midnight span', 
      details: error.message 
    });
  }
});

/**
 * POST /api/new-salary/calculate
 * Calculate salary for an employee based on date range, holidays, and hourly rate
 */
router.post('/calculate', auth, adminAuth, async (req, res) => {
  try {
    const { userId, startDate, endDate, holidays, perHourRate, notes } = req.body;

    // Validation
    if (!userId || !startDate || !endDate || !perHourRate) {
      return res.status(400).json({ 
        error: 'Missing required fields: userId, startDate, endDate, perHourRate' 
      });
    }

    if (perHourRate <= 0) {
      return res.status(400).json({ error: 'Per hour rate must be greater than 0' });
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (start > end) {
      return res.status(400).json({ error: 'Start date must be before end date' });
    }

    // Fetch working hours from attendance
    const attendanceRecords = await DailyAttendance.find({
      user: userId,
      date: {
        $gte: start,
        $lte: end
      },
      startDayTime: { $exists: true }
    }).select('date totalHoursWorked');

    // Calculate total working hours
    const workingHours = attendanceRecords.reduce((sum, record) => {
      return sum + (record.totalHoursWorked || 0);
    }, 0);

    // Process holidays (each holiday = 8 hours)
    const holidayDates = holidays && Array.isArray(holidays) ? holidays.map(h => new Date(h)) : [];
    const holidayHours = holidayDates.length * 8;

    // Calculate total cumulative hours
    const totalCumulativeHours = workingHours + holidayHours;

    // Calculate salary
    const calculatedSalary = totalCumulativeHours * perHourRate;

    // Create or update salary record
    const salaryRecord = await NewSalaryRecord.findOneAndUpdate(
      {
        user: userId,
        startDate: start,
        endDate: end
      },
      {
        user: userId,
        startDate: start,
        endDate: end,
        holidays: holidayDates.map(date => ({
          date: date,
          hours: 8
        })),
        workingHours: Math.round(workingHours * 100) / 100,
        holidayHours: holidayHours,
        totalCumulativeHours: Math.round(totalCumulativeHours * 100) / 100,
        perHourRate: perHourRate,
        calculatedSalary: Math.round(calculatedSalary * 100) / 100,
        calculatedBy: req.user.id,
        notes: notes || '',
        status: 'Calculated'
      },
      {
        upsert: true,
        new: true
      }
    ).populate('user', 'name email employeeId');

    res.json({
      success: true,
      data: {
        salaryRecord: {
          _id: salaryRecord._id,
          userId: salaryRecord.user._id,
          userName: salaryRecord.user.name,
          userEmail: salaryRecord.user.email,
          startDate: salaryRecord.startDate,
          endDate: salaryRecord.endDate,
          workingHours: salaryRecord.workingHours,
          holidayCount: holidayDates.length,
          holidayHours: salaryRecord.holidayHours,
          totalCumulativeHours: salaryRecord.totalCumulativeHours,
          perHourRate: salaryRecord.perHourRate,
          calculatedSalary: salaryRecord.calculatedSalary,
          notes: salaryRecord.notes,
          calculatedAt: salaryRecord.calculatedAt
        }
      }
    });
  } catch (error) {
    console.error('Error calculating salary:', error);
    res.status(500).json({ error: 'Failed to calculate salary', details: error.message });
  }
});

/**
 * GET /api/new-salary/records/:userId
 * Get all salary records for an employee
 */
router.get('/records/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify authorization
    if (req.user.id !== userId && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const records = await NewSalaryRecord.find({ user: userId })
      .sort({ calculatedAt: -1 })
      .populate('calculatedBy', 'name email')
      .select('-__v');

    res.json({
      success: true,
      data: records
    });
  } catch (error) {
    console.error('Error fetching salary records:', error);
    res.status(500).json({ error: 'Failed to fetch salary records' });
  }
});

/**
 * GET /api/new-salary/records
 * Get all salary records (Admin only)
 */
router.get('/records', auth, adminAuth, async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.query;

    const query = {};
    if (userId) query.user = userId;
    if (startDate || endDate) {
      query.calculatedAt = {};
      if (startDate) query.calculatedAt.$gte = new Date(startDate);
      if (endDate) query.calculatedAt.$lte = new Date(endDate);
    }

    const records = await NewSalaryRecord.find(query)
      .sort({ calculatedAt: -1 })
      .populate('user', 'name email employeeId')
      .populate('calculatedBy', 'name email')
      .select('-__v');

    records.sort(compareBySurname);

    res.json({
      success: true,
      data: records
    });
  } catch (error) {
    console.error('Error fetching salary records:', error);
    res.status(500).json({ error: 'Failed to fetch salary records' });
  }
});

/**
 * DELETE /api/new-salary/records/:recordId
 * Delete a salary record (Admin only)
 */
router.delete('/records/:recordId', auth, adminAuth, async (req, res) => {
  try {
    const { recordId } = req.params;

    const record = await NewSalaryRecord.findByIdAndDelete(recordId);

    if (!record) {
      return res.status(404).json({ error: 'Salary record not found' });
    }

    res.json({
      success: true,
      message: 'Salary record deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting salary record:', error);
    res.status(500).json({ error: 'Failed to delete salary record' });
  }
});

/**
 * ============================================
 * CONFIRMED SALARY SECTION
 * ============================================
 */

/**
 * PUT /api/new-salary/confirm/:recordId
 * Confirm a salary record with optional adjusted amount
 * Admin only
 */
router.put('/confirm/:recordId', auth, adminAuth, async (req, res) => {
  try {
    const { recordId } = req.params;
    const { confirmedSalary, confirmationNotes } = req.body;

    const record = await NewSalaryRecord.findById(recordId);
    
    if (!record) {
      return res.status(404).json({ error: 'Salary record not found' });
    }

    // Use the provided confirmedSalary or default to calculatedSalary
    const finalConfirmedSalary = confirmedSalary !== undefined && confirmedSalary !== null 
      ? parseFloat(confirmedSalary) 
      : record.calculatedSalary;

    record.confirmedSalary = finalConfirmedSalary;
    record.isConfirmed = true;
    record.confirmedBy = req.user.id;
    record.confirmedAt = new Date();
    record.confirmationNotes = confirmationNotes || '';
    record.status = 'Confirmed';

    await record.save();

    // Populate user info for response
    await record.populate('user', 'name email employeeId');
    await record.populate('confirmedBy', 'name email');

    res.json({
      success: true,
      message: 'Salary confirmed successfully',
      data: {
        _id: record._id,
        userId: record.user._id,
        userName: record.user.name,
        userEmail: record.user.email,
        startDate: record.startDate,
        endDate: record.endDate,
        workingHours: record.workingHours,
        holidayHours: record.holidayHours,
        totalCumulativeHours: record.totalCumulativeHours,
        perHourRate: record.perHourRate,
        calculatedSalary: record.calculatedSalary,
        confirmedSalary: record.confirmedSalary,
        isConfirmed: record.isConfirmed,
        confirmedBy: record.confirmedBy,
        confirmedAt: record.confirmedAt,
        confirmationNotes: record.confirmationNotes,
        status: record.status
      }
    });
  } catch (error) {
    console.error('Error confirming salary:', error);
    res.status(500).json({ error: 'Failed to confirm salary', details: error.message });
  }
});

/**
 * GET /api/new-salary/confirmed
 * Get all confirmed salary records (not yet bucketed)
 * Admin only
 */
router.get('/confirmed', auth, adminAuth, async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.query;

    // Only get confirmed records that are NOT bucketed yet
    const query = { 
      isConfirmed: true,
      $or: [
        { isBucketed: { $exists: false } },
        { isBucketed: false }
      ]
    };
    
    if (userId) query.user = userId;
    if (startDate || endDate) {
      query.startDate = {};
      if (startDate) query.startDate.$gte = new Date(startDate);
      if (endDate) query.startDate.$lte = new Date(endDate);
    }

    const records = await NewSalaryRecord.find(query)
      .sort({ confirmedAt: -1 })
      .populate('user', 'name email employeeId department')
      .populate('confirmedBy', 'name email')
      .populate('calculatedBy', 'name email')
      .select('-__v');

    records.sort(compareBySurname);

    res.json({
      success: true,
      data: records
    });
  } catch (error) {
    console.error('Error fetching confirmed salaries:', error);
    res.status(500).json({ error: 'Failed to fetch confirmed salaries' });
  }
});

/**
 * PUT /api/new-salary/confirmed/:recordId
 * Update a confirmed salary record
 * Admin only
 */
router.put('/confirmed/:recordId', auth, adminAuth, async (req, res) => {
  try {
    const { recordId } = req.params;
    const { perHourRate, confirmedSalary, confirmationNotes } = req.body;

    const record = await NewSalaryRecord.findById(recordId);
    
    if (!record) {
      return res.status(404).json({ error: 'Salary record not found' });
    }

    if (!record.isConfirmed) {
      return res.status(400).json({ error: 'This salary record is not confirmed yet' });
    }

    // Update per hour rate if provided
    if (perHourRate !== undefined && perHourRate !== null) {
      record.perHourRate = parseFloat(perHourRate);
      // Recalculate the calculated salary based on new rate
      record.calculatedSalary = parseFloat(perHourRate) * record.totalCumulativeHours;
    }
    
    if (confirmedSalary !== undefined && confirmedSalary !== null) {
      record.confirmedSalary = parseFloat(confirmedSalary);
    }
    if (confirmationNotes !== undefined) {
      record.confirmationNotes = confirmationNotes;
    }
    record.confirmedBy = req.user.id;
    record.confirmedAt = new Date();

    await record.save();

    await record.populate('user', 'name email employeeId department');
    await record.populate('confirmedBy', 'name email');

    res.json({
      success: true,
      message: 'Confirmed salary updated successfully',
      data: record
    });
  } catch (error) {
    console.error('Error updating confirmed salary:', error);
    res.status(500).json({ error: 'Failed to update confirmed salary', details: error.message });
  }
});

/**
 * DELETE /api/new-salary/confirmed/:recordId
 * Remove confirmation from a salary record (revert to calculated)
 * Admin only
 */
router.delete('/confirmed/:recordId', auth, adminAuth, async (req, res) => {
  try {
    const { recordId } = req.params;

    const record = await NewSalaryRecord.findById(recordId);
    
    if (!record) {
      return res.status(404).json({ error: 'Salary record not found' });
    }

    record.confirmedSalary = null;
    record.isConfirmed = false;
    record.confirmedBy = null;
    record.confirmedAt = null;
    record.confirmationNotes = '';
    record.status = 'Calculated';

    await record.save();

    res.json({
      success: true,
      message: 'Salary confirmation removed successfully'
    });
  } catch (error) {
    console.error('Error removing salary confirmation:', error);
    res.status(500).json({ error: 'Failed to remove salary confirmation' });
  }
});

/**
 * ============================================
 * SALARY HISTORY SECTION
 * ============================================
 */

/**
 * GET /api/new-salary/history/buckets
 * Get all salary periods (buckets) grouped by date range
 * Returns summary for each unique date range (only bucketed records)
 * Admin only
 */
router.get('/history/buckets', auth, adminAuth, async (req, res) => {
  try {
    // Aggregate bucketed salaries by date range (startDate + endDate combination)
    const buckets = await NewSalaryRecord.aggregate([
      {
        $match: { 
          isConfirmed: true,
          isBucketed: true
        }
      },
      {
        $group: {
          _id: {
            startDate: '$startDate',
            endDate: '$endDate'
          },
          employeeCount: { $sum: 1 },
          totalSalary: { $sum: '$confirmedSalary' },
          totalHours: { $sum: '$totalCumulativeHours' },
          records: { $push: '$_id' }
        }
      },
      {
        $project: {
          _id: 0,
          startDate: '$_id.startDate',
          endDate: '$_id.endDate',
          employeeCount: 1,
          totalSalary: 1,
          totalHours: 1,
          recordCount: { $size: '$records' }
        }
      },
      {
        $sort: { startDate: -1 }
      }
    ]);

    console.log(`📁 Found ${buckets.length} salary periods (buckets)`);

    res.json({
      success: true,
      data: buckets
    });
  } catch (error) {
    console.error('Error fetching salary buckets:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch salary history' 
    });
  }
});

/**
 * GET /api/new-salary/history/bucket-details
 * Get all confirmed salary records for a specific date range
 * Query params: startDate, endDate
 * Admin only
 */
router.get('/history/bucket-details', auth, adminAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Find all bucketed records for this exact date range
    const records = await NewSalaryRecord.find({
      isConfirmed: true,
      isBucketed: true,
      startDate: {
        $gte: new Date(start.setHours(0, 0, 0, 0)),
        $lte: new Date(start.setHours(23, 59, 59, 999))
      },
      endDate: {
        $gte: new Date(end.setHours(0, 0, 0, 0)),
        $lte: new Date(end.setHours(23, 59, 59, 999))
      }
    })
    .populate('user', 'name email employeeId department')
    .populate({
      path: 'user',
      populate: {
        path: 'department',
        select: 'name color'
      }
    })
    .populate('confirmedBy', 'name email');

    records.sort(compareBySurname);

    console.log(`📁 Found ${records.length} records for period ${startDate} to ${endDate}`);

    res.json({
      success: true,
      data: records
    });
  } catch (error) {
    console.error('Error fetching bucket details:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch bucket details' 
    });
  }
});

/**
 * POST /api/new-salary/history/create-bucket
 * Create a bucket by marking confirmed salaries as "bucketed" (moved to history)
 * This marks records as finalized and clears them from the confirmed list
 * Body: { recordIds: array of record IDs }
 * Admin only
 */
router.post('/history/create-bucket', auth, adminAuth, async (req, res) => {
  try {
    const { recordIds } = req.body;

    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'recordIds array is required'
      });
    }

    // Update all records to mark them as bucketed (finalized)
    const result = await NewSalaryRecord.updateMany(
      { 
        _id: { $in: recordIds },
        isConfirmed: true 
      },
      { 
        $set: { 
          isBucketed: true,
          bucketedAt: new Date(),
          bucketedBy: req.user.id
        } 
      }
    );

    console.log(`📁 Created bucket with ${result.modifiedCount} salary records`);

    res.json({
      success: true,
      message: `Successfully created bucket with ${result.modifiedCount} salary record(s)`,
      data: {
        recordsProcessed: result.modifiedCount
      }
    });
  } catch (error) {
    console.error('Error creating bucket:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create bucket' 
    });
  }
});

/**
 * DELETE /api/new-salary/history/delete-bucket
 * Delete all salary records in a bucket (by date range)
 * Query params: startDate, endDate
 * Admin only
 */
router.delete('/history/delete-bucket', auth, adminAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Delete all bucketed records for this exact date range
    const result = await NewSalaryRecord.deleteMany({
      isConfirmed: true,
      isBucketed: true,
      startDate: {
        $gte: new Date(start.setHours(0, 0, 0, 0)),
        $lte: new Date(new Date(startDate).setHours(23, 59, 59, 999))
      },
      endDate: {
        $gte: new Date(end.setHours(0, 0, 0, 0)),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
      }
    });

    console.log(`🗑️ Deleted bucket with ${result.deletedCount} salary records`);

    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} salary record(s)`,
      data: {
        deletedCount: result.deletedCount
      }
    });
  } catch (error) {
    console.error('Error deleting bucket:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete bucket' 
    });
  }
});

/**
 * ============================================
 * SPAM USERS MANAGEMENT SECTION
 * ============================================
 */

/**
 * GET /api/new-salary/spam-users
 * Get all users with auto-ended attendance records (spam detection)
 * Query params: fromDate, toDate (optional)
 * Admin only
 */
router.get('/spam-users', auth, adminAuth, async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;

    // Parse date range (optional)
    let startDate, endDate;
    
    if (fromDate) {
      const dateParts = fromDate.split('-');
      if (dateParts.length === 3) {
        startDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
        startDate.setHours(0, 0, 0, 0);
      } else {
        startDate = new Date(fromDate);
        startDate.setHours(0, 0, 0, 0);
      }
    }
    
    if (toDate) {
      const dateParts = toDate.split('-');
      if (dateParts.length === 3) {
        endDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
        endDate.setHours(23, 59, 59, 999);
      } else {
        endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
      }
    }

    // Build query for auto-ended records
    // Exclude records already marked as 'Spam' (they're permanently excluded)
    // Show: Pending Review, Suspicious, Valid (validated but still auto-ended)
    const query = {
      autoEnded: true,
      isPresent: true,
      isLeave: false,
      // Exclude records marked as Spam
      $and: [
        {
          $or: [
            { spamStatus: { $exists: false } }, // Old records without spamStatus (treat as pending)
            { spamStatus: { $ne: 'Spam' } } // Any status except Spam
          ]
        }
      ]
    };

    // Add date filter if provided
    if (startDate && endDate) {
      query.date = {
        $gte: startDate,
        $lte: endDate
      };
    }

    // Fetch auto-ended attendance records
    const spamRecords = await DailyAttendance.find(query)
      .populate('user', 'name email employeeId department')
      .populate('markedAsSpamBy', 'name email')
      .populate('validatedBy', 'name email')
      .select('user date totalHoursWorked autoEnded spamStatus spamReason markedAsSpamBy markedAsSpamAt validatedBy validatedAt startDayTime endDayTime systemNotes')
      .sort({ date: -1 })
      .lean();

    console.log(`Found ${spamRecords.length} auto-ended attendance records`);

    // Group by user
    const userSpamMap = new Map();

    spamRecords.forEach(record => {
      if (!record.user) return;
      
      const userId = record.user._id.toString();
      
      if (!userSpamMap.has(userId)) {
        userSpamMap.set(userId, {
          userId: record.user._id,
          userName: record.user.name,
          userEmail: record.user.email,
          employeeId: record.user.employeeId,
          department: record.user.department?.name || 'No Department',
          records: [],
          totalSpamHours: 0,
          totalSpamDays: 0,
          pendingReview: 0,
          validated: 0,
          markedAsSpam: 0
        });
      }

      const userData = userSpamMap.get(userId);
      userData.records.push({
        _id: record._id,
        date: record.date,
        totalHoursWorked: record.totalHoursWorked || 0,
        startDayTime: record.startDayTime,
        endDayTime: record.endDayTime,
        spamStatus: record.spamStatus || 'Pending Review',
        spamReason: record.spamReason || 'Auto-ended by system',
        systemNotes: record.systemNotes,
        markedAsSpamBy: record.markedAsSpamBy,
        markedAsSpamAt: record.markedAsSpamAt,
        validatedBy: record.validatedBy,
        validatedAt: record.validatedAt
      });

      userData.totalSpamHours += record.totalHoursWorked || 0;
      userData.totalSpamDays += 1;

      // Count by status
      const status = record.spamStatus || 'Pending Review';
      if (status === 'Pending Review') userData.pendingReview += 1;
      else if (status === 'Valid') userData.validated += 1;
      else if (status === 'Spam') userData.markedAsSpam += 1;
    });

    // Convert to array and sort alphabetically by surname (last name)
    const spamUsers = Array.from(userSpamMap.values())
      .map(user => ({
        ...user,
        totalSpamHours: Math.round(user.totalSpamHours * 100) / 100
      }))
      .sort(compareBySurname);

    res.json({
      success: true,
      data: {
        spamUsers,
        totalSpamUsers: spamUsers.length,
        totalSpamRecords: spamRecords.length,
        dateRange: startDate && endDate ? {
          from: startDate.toISOString(),
          to: endDate.toISOString()
        } : null
      }
    });
  } catch (error) {
    console.error('Error fetching spam users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch spam users data',
      details: error.message
    });
  }
});

/**
 * POST /api/new-salary/spam-users/validate
 * Mark an auto-ended attendance record as valid (include in salary)
 * Body: { recordId, action: 'validate' | 'spam', reason? }
 * Admin only
 */
router.post('/spam-users/validate', auth, adminAuth, async (req, res) => {
  try {
    const { recordId, action, reason } = req.body;

    console.log('📝 Validate spam record request:', { recordId, action, reason, userId: req.user.id });

    if (!recordId || !action) {
      return res.status(400).json({
        success: false,
        error: 'recordId and action are required'
      });
    }

    if (!['validate', 'spam'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'action must be either "validate" or "spam"'
      });
    }

    // Validate and convert recordId format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(recordId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid recordId format'
      });
    }

    const recordObjectId = new mongoose.Types.ObjectId(recordId);

    // Find the attendance record
    let record;
    try {
      record = await DailyAttendance.findById(recordObjectId)
        .populate('user', 'name email');
    } catch (findError) {
      console.error('Error finding record:', findError);
      return res.status(500).json({
        success: false,
        error: 'Error finding attendance record',
        details: findError.message
      });
    }

    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Attendance record not found'
      });
    }

    console.log('Found record:', {
      _id: record._id,
      autoEnded: record.autoEnded,
      spamStatus: record.spamStatus,
      userId: record.user?._id || record.user
    });

    if (!record.autoEnded) {
      return res.status(400).json({
        success: false,
        error: 'This record is not auto-ended'
      });
    }

    // Update record based on action
    if (action === 'validate') {
      // Mark as Valid - this will include it in hours management
      record.spamStatus = 'Valid';
      record.validatedBy = req.user.id;
      record.validatedAt = new Date();
      record.spamReason = reason || 'Validated by admin';
      // Also ensure autoEnded is still true (for tracking)
      record.autoEnded = true;
    } else if (action === 'spam') {
      // Mark as Spam - this will exclude it from hours management and spam list
      record.spamStatus = 'Spam';
      record.markedAsSpamBy = req.user.id;
      record.markedAsSpamAt = new Date();
      record.spamReason = reason || 'Marked as spam by admin';
    }

    // Save the record using updateOne to avoid validation issues
    try {
      const updateData = {};

      if (action === 'validate') {
        updateData.spamStatus = 'Valid';
        updateData.validatedBy = req.user.id;
        updateData.validatedAt = new Date();
        updateData.spamReason = reason || 'Validated by admin';
      } else if (action === 'spam') {
        updateData.spamStatus = 'Spam';
        updateData.markedAsSpamBy = req.user.id;
        updateData.markedAsSpamAt = new Date();
        updateData.spamReason = reason || 'Marked as spam by admin';
      }

      console.log('Updating record with:', updateData);

      const updateResult = await DailyAttendance.updateOne(
        { _id: recordObjectId },
        { $set: updateData }
      );

      console.log('Update result:', {
        matchedCount: updateResult.matchedCount,
        modifiedCount: updateResult.modifiedCount,
        acknowledged: updateResult.acknowledged
      });

      if (updateResult.matchedCount === 0) {
        throw new Error('Record not found for update');
      }

      if (updateResult.modifiedCount === 0) {
        console.warn('⚠️ Record matched but not modified. It may already have the same spamStatus.');
      }

      console.log(`✅ Successfully updated record ${recordId} with spamStatus: ${updateData.spamStatus}`);
      
      // Update the record object for response
      record.spamStatus = updateData.spamStatus;
      record.spamReason = updateData.spamReason;
    } catch (saveError) {
      console.error('❌ Error saving record:', saveError);
      console.error('Save error details:', {
        message: saveError.message,
        name: saveError.name,
        code: saveError.code,
        stack: saveError.stack
      });
      // Re-throw to be caught by outer catch
      throw new Error(`Failed to save record: ${saveError.message}`);
    }

    // Create alert/notification for spam detection
    if (action === 'spam') {
      try {
        const Notification = require('../models/Notification');
        const branchQuery = getBranchQuery(req);
        
        // Notify Admin and Manager - FILTERED BY BRANCH
        const admins = await User.find({ role: { $in: ['Admin', 'Manager'] }, ...branchQuery })
          .select('_id');

        if (admins && admins.length > 0) {
          const notifications = admins.map(admin => ({
            recipient: admin._id, // Use 'recipient' instead of 'user'
            type: 'procurement_alert', // Use existing enum value
            title: 'Auto-Ended Attendance Marked as Spam',
            message: `User ${record.user?.name || 'Unknown'} has an auto-ended attendance record marked as spam on ${new Date(record.date).toLocaleDateString()}. Hours: ${record.totalHoursWorked || 0}h`,
            read: false
          }));

          await Notification.insertMany(notifications);
          console.log(`Created ${notifications.length} spam detection notifications`);
        }
      } catch (notifError) {
        // Don't fail the request if notification creation fails
        console.error('Error creating notifications (non-critical):', notifError);
      }
    }

    // Get user info from the populated record (handle both populated and non-populated cases)
    let userId, userName;
    if (record.user) {
      if (typeof record.user === 'object' && record.user._id) {
        // User is populated
        userId = record.user._id;
        userName = record.user.name || 'Unknown';
      } else {
        // User is just an ObjectId
        userId = record.user;
        userName = 'Unknown';
      }
    } else {
      // No user field - try to get from record directly
      userId = record.user || null;
      userName = 'Unknown';
    }

    console.log('Response data:', {
      recordId: record._id,
      userId: userId,
      userName: userName,
      spamStatus: record.spamStatus
    });

    res.json({
      success: true,
      message: `Attendance record ${action === 'validate' ? 'validated' : 'marked as spam'} successfully. ${action === 'validate' ? 'Hours will now be included in salary calculation.' : 'Record removed from spam list.'}`,
      data: {
        record: {
          _id: record._id.toString(),
          userId: userId ? userId.toString() : null,
          userName: userName,
          date: record.date,
          spamStatus: record.spamStatus,
          spamReason: record.spamReason,
          totalHoursWorked: record.totalHoursWorked || 0
        }
      }
    });
  } catch (error) {
    console.error('❌ Error validating spam record:', error);
    console.error('Error stack:', error.stack);
    
    // Only send response if not already sent
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Failed to validate spam record',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
});

/**
 * POST /api/new-salary/spam-users/bulk-validate
 * Bulk validate or mark multiple records
 * Body: { recordIds: [], action: 'validate' | 'spam', reason? }
 * Admin only
 */
router.post('/spam-users/bulk-validate', auth, adminAuth, async (req, res) => {
  try {
    const { recordIds, action, reason } = req.body;

    console.log('📝 Bulk validate spam records request:', { recordIdsCount: recordIds?.length, action, userId: req.user.id });

    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'recordIds array is required'
      });
    }

    if (!['validate', 'spam'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'action must be either "validate" or "spam"'
      });
    }

    // Validate all recordIds are valid ObjectIds
    const mongoose = require('mongoose');
    const validRecordIds = recordIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    
    if (validRecordIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid recordIds found'
      });
    }

    if (validRecordIds.length !== recordIds.length) {
      console.warn(`⚠️ Some invalid recordIds filtered out: ${recordIds.length - validRecordIds.length} invalid`);
    }

    // Convert to ObjectIds
    const recordObjectIds = validRecordIds.map(id => new mongoose.Types.ObjectId(id));

    // Update all records
    const updateData = action === 'validate' ? {
      spamStatus: 'Valid',
      validatedBy: req.user.id,
      validatedAt: new Date(),
      spamReason: reason || 'Bulk validated by admin'
    } : {
      spamStatus: 'Spam',
      markedAsSpamBy: req.user.id,
      markedAsSpamAt: new Date(),
      spamReason: reason || 'Bulk marked as spam by admin'
    };

    console.log('Bulk updating records with:', { count: recordObjectIds.length, updateData });

    const result = await DailyAttendance.updateMany(
      {
        _id: { $in: recordObjectIds },
        autoEnded: true
      },
      { $set: updateData }
    );

    console.log('Bulk update result:', {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      acknowledged: result.acknowledged
    });

    // Create notifications for spam records
    if (action === 'spam' && result.modifiedCount > 0) {
      try {
        const Notification = require('../models/Notification');
        const branchQuery = getBranchQuery(req);
        // Notify Admin and Manager - FILTERED BY BRANCH
        const admins = await User.find({ role: { $in: ['Admin', 'Manager'] }, ...branchQuery })
          .select('_id');

        if (admins && admins.length > 0) {
          const notifications = admins.map(admin => ({
            recipient: admin._id, // Use 'recipient' instead of 'user'
            type: 'procurement_alert', // Use existing enum value
            title: 'Bulk Spam Detection',
            message: `${result.modifiedCount} auto-ended attendance records marked as spam`,
            read: false
          }));

          if (notifications.length > 0) {
            await Notification.insertMany(notifications);
            console.log(`Created ${notifications.length} bulk spam detection notifications`);
          }
        }
      } catch (notifError) {
        // Don't fail the request if notification creation fails
        console.error('Error creating bulk notifications (non-critical):', notifError);
      }
    }

    res.json({
      success: true,
      message: `${result.modifiedCount} records ${action === 'validate' ? 'validated' : 'marked as spam'} successfully`,
      data: {
        modifiedCount: result.modifiedCount
      }
    });
  } catch (error) {
    console.error('Error bulk validating spam records:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk validate spam records',
      details: error.message
    });
  }
});

module.exports = router;

