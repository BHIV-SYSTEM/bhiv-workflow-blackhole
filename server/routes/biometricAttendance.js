const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const biometricProcessor = require('../services/biometricProcessor');
const attendanceSalaryService = require('../services/attendanceSalaryService');
const EmployeeMaster = require('../models/EmployeeMaster');
const User = require('../models/User');
const Department = require('../models/Department');
const DailyAttendance = require('../models/DailyAttendance');
const BiometricPunch = require('../models/BiometricPunch');
const BiometricUpload = require('../models/BiometricUpload');
const PublicHoliday = require('../models/PublicHoliday');
const PaidLeaveConfig = require('../models/PaidLeaveConfig');
const XLSX = require('xlsx');
const { formatEmployeeId } = require('../utils/employeeId');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/biometric');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'biometric-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    const allowedTypes = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max
  }
});

// Authentication middleware
const auth = require('../middleware/auth');

/**
 * @route   POST /api/biometric-attendance/upload
 * @desc    Upload biometric data file (CSV/Excel)
 * @access  Private (Admin/Manager)
 */
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('📤 Processing biometric upload:', req.file.originalname);

    // Process the file
    const result = await biometricProcessor.parseFile(
      req.file.path,
      req.file.originalname,
      req.user.id
    );

    res.json({
      success: true,
      message: 'Biometric data uploaded and processed successfully',
      data: result
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/biometric-attendance/derive-attendance
 * @desc    Derive daily attendance from biometric punches
 * @access  Private (Admin/Manager)
 */
router.post('/derive-attendance', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    console.log(`📊 Deriving attendance from ${startDate} to ${endDate}`);

    const result = await biometricProcessor.deriveDailyAttendance(startDate, endDate);

    res.json({
      success: true,
      message: 'Attendance derived successfully',
      data: result
    });

  } catch (error) {
    console.error('❌ Derive attendance error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/biometric-attendance/salary-calculation
 * @desc    Calculate salary for date range
 * @access  Private
 */
router.post('/salary-calculation', auth, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      userId,
      departmentId,
      workType
    } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    console.log(`💰 Calculating salary from ${startDate} to ${endDate}`);

    const result = await attendanceSalaryService.calculateSalaryForDateRange({
      startDate,
      endDate,
      userId,
      departmentId,
      workType
    });

    res.json(result);

  } catch (error) {
    console.error('❌ Salary calculation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/biometric-attendance/dashboard-kpis
 * @desc    Get today's KPIs for dashboard
 * @access  Private
 */
router.get('/dashboard-kpis', auth, async (req, res) => {
  try {
    const { departmentId, workType } = req.query;

    const kpis = await attendanceSalaryService.getTodayKPIs({
      departmentId,
      workType
    });

    res.json({
      success: true,
      data: kpis
    });

  } catch (error) {
    console.error('❌ KPIs error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/biometric-attendance/detailed-logs
 * @desc    Get detailed attendance logs
 * @access  Private
 */
router.get('/detailed-logs', auth, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      userId,
      departmentId,
      workType,
      status
    } = req.query;

    const logs = await attendanceSalaryService.getDetailedLogs({
      startDate,
      endDate,
      userId,
      departmentId,
      workType,
      status
    });

    res.json({
      success: true,
      data: logs
    });

  } catch (error) {
    console.error('❌ Detailed logs error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/biometric-attendance/employee-aggregates
 * @desc    Get employee-wise aggregated data
 * @access  Private
 */
router.get('/employee-aggregates', auth, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      departmentId,
      workType
    } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const aggregates = await attendanceSalaryService.getEmployeeAggregates({
      startDate,
      endDate,
      departmentId,
      workType
    });

    res.json({
      success: true,
      data: aggregates
    });

  } catch (error) {
    console.error('❌ Employee aggregates error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/biometric-attendance/employee-master
 * @desc    Create or update employee master record
 * @access  Private (Admin)
 */
router.post('/employee-master', auth, async (req, res) => {
  try {
    const {
      userId,
      employeeId,
      biometricId,
      salaryType,
      monthlySalary,
      hourlyRate,
      dailyRate,
      standardShiftHours,
      overtimeEnabled,
      overtimeRate,
      allowances,
      deductions
    } = req.body;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create or update employee master
    const employeeMaster = await EmployeeMaster.findOneAndUpdate(
      { user: userId },
      {
        user: userId,
        employeeId,
        biometricId,
        name: user.name,
        department: user.department,
        salaryType,
        monthlySalary: monthlySalary || 0,
        hourlyRate: hourlyRate || 0,
        dailyRate: dailyRate || 0,
        standardShiftHours: standardShiftHours || 8,
        overtimeEnabled: overtimeEnabled !== undefined ? overtimeEnabled : true,
        overtimeRate: overtimeRate || 1.5,
        allowances: allowances || {},
        deductions: deductions || {},
        isActive: true
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: 'Employee master record saved successfully',
      data: employeeMaster
    });

  } catch (error) {
    console.error('❌ Employee master error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/biometric-attendance/employee-master
 * @desc    Get all employee master records
 * @access  Private
 */
router.get('/employee-master', auth, async (req, res) => {
  try {
    const { userId } = req.query;

    const query = userId ? { user: userId } : { isActive: true };

    const employees = await EmployeeMaster.find(query)
      .populate('user', 'name email')
      .populate('department', 'name')
      .sort({ name: 1 });

    res.json({
      success: true,
      data: employees
    });

  } catch (error) {
    console.error('❌ Get employee master error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/biometric-attendance/upload-history
 * @desc    Get biometric upload history
 * @access  Private
 */
router.get('/upload-history', auth, async (req, res) => {
  try {
    const { limit = 20, skip = 0 } = req.query;

    const uploads = await BiometricUpload.find()
      .populate('processedBy', 'name email')
      .sort({ uploadDate: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await BiometricUpload.countDocuments();

    res.json({
      success: true,
      data: uploads,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip)
      }
    });

  } catch (error) {
    console.error('❌ Upload history error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/biometric-attendance/export-salary
 * @desc    Export salary calculation to Excel
 * @access  Private
 */
router.get('/export-salary', auth, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      departmentId,
      workType
    } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    // Get salary data
    const result = await attendanceSalaryService.calculateSalaryForDateRange({
      startDate,
      endDate,
      departmentId,
      workType
    });

    // Prepare data for Excel
    const excelData = result.employees.map(emp => ({
      'Employee ID': emp.user.employeeId || formatEmployeeId(emp.user.email),
      'Employee Name': emp.user.name,
      'Email': emp.user.email,
      'Department': emp.user.department?.name || 'N/A',
      'Total Days': emp.summary.workingDaysInRange,
      'Present Days': emp.summary.presentDays,
      'Absent Days': emp.summary.absentDays,
      'Half Days': emp.summary.halfDays,
      'Leave Days': emp.summary.leaveDays,
      'Late Days': emp.summary.lateDays,
      'Total Hours': emp.summary.totalHours,
      'Regular Hours': emp.summary.regularHours,
      'Overtime Hours': emp.summary.overtimeHours,
      'Regular Pay': emp.summary.regularPay.toFixed(2),
      'Overtime Pay': emp.summary.overtimePay.toFixed(2),
      'Allowances': emp.summary.allowances.toFixed(2),
      'Bonuses': emp.summary.bonuses.toFixed(2),
      'Deductions': emp.summary.deductions.toFixed(2),
      'Total Payable': emp.summary.totalPayable.toFixed(2)
    }));

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    ws['!cols'] = [
      { wch: 20 }, // Employee Name
      { wch: 30 }, // Email
      { wch: 15 }, // Department
      { wch: 12 }, // Total Days
      { wch: 12 }, // Present Days
      { wch: 12 }, // Absent Days
      { wch: 12 }, // Half Days
      { wch: 12 }, // Leave Days
      { wch: 12 }, // Late Days
      { wch: 12 }, // Total Hours
      { wch: 12 }, // Regular Hours
      { wch: 12 }, // Overtime Hours
      { wch: 12 }, // Regular Pay
      { wch: 12 }, // Overtime Pay
      { wch: 12 }, // Allowances
      { wch: 12 }, // Bonuses
      { wch: 12 }, // Deductions
      { wch: 12 }  // Total Payable
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Salary Report');

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=salary-report-${startDate}-to-${endDate}.xlsx`);

    res.send(buffer);

  } catch (error) {
    console.error('❌ Export error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/biometric-attendance/export-detailed-logs
 * @desc    Export detailed attendance logs to Excel
 * @access  Private
 */
router.get('/export-detailed-logs', auth, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      departmentId,
      workType,
      status
    } = req.query;

    // Get detailed logs
    const logs = await attendanceSalaryService.getDetailedLogs({
      startDate,
      endDate,
      departmentId,
      workType,
      status
    });

    // Prepare data for Excel
    const excelData = logs.map(log => ({
      'Employee ID': log.user?.employeeId || formatEmployeeId(log.user?.email),
      'Date': new Date(log.date).toLocaleDateString(),
      'Employee Name': log.user.name,
      'Email': log.user.email,
      'Department': log.user.department?.name || 'N/A',
      'Punch In': log.biometricTimeIn ? new Date(log.biometricTimeIn).toLocaleTimeString() : 'N/A',
      'Punch Out': log.biometricTimeOut ? new Date(log.biometricTimeOut).toLocaleTimeString() : 'N/A',
      'Total Hours': log.totalHoursWorked || 0,
      'Regular Hours': log.regularHours || 0,
      'Overtime Hours': log.overtimeHours || 0,
      'Status': log.status,
      'Work Type': log.workLocationType || 'Office',
      'Earned Amount': log.earnedAmount?.toFixed(2) || '0.00'
    }));

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    ws['!cols'] = [
      { wch: 12 }, // Date
      { wch: 20 }, // Employee Name
      { wch: 30 }, // Email
      { wch: 15 }, // Department
      { wch: 12 }, // Punch In
      { wch: 12 }, // Punch Out
      { wch: 12 }, // Total Hours
      { wch: 12 }, // Regular Hours
      { wch: 12 }, // Overtime Hours
      { wch: 12 }, // Status
      { wch: 12 }, // Work Type
      { wch: 12 }  // Earned Amount
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Attendance Logs');

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=attendance-logs-${startDate || 'all'}.xlsx`);

    res.send(buffer);

  } catch (error) {
    console.error('❌ Export error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/biometric-attendance/departments
 * @desc    Get all departments for filters
 * @access  Private
 */
router.get('/departments', auth, async (req, res) => {
  try {
    const departments = await Department.find().select('name').sort({ name: 1 });
    res.json({
      success: true,
      data: departments
    });
  } catch (error) {
    console.error('❌ Get departments error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/biometric-attendance/users
 * @desc    Get all users for filters
 * @access  Private
 */
router.get('/users', auth, async (req, res) => {
  try {
    const { departmentId } = req.query;
    const query = { stillExist: 1 };
    
    if (departmentId) {
      query.department = departmentId;
    }

    const users = await User.find(query)
      .select('name email department')
      .populate('department', 'name')
      .sort({ name: 1 });

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== PUBLIC HOLIDAYS MANAGEMENT ====================

// Get all public holidays
router.get('/public-holidays', auth, async (req, res) => {
  try {
    const { startDate, endDate, departmentId } = req.query;
    
    let holidays;
    if (startDate && endDate) {
      holidays = await PublicHoliday.getHolidaysInRange(
        new Date(startDate),
        new Date(endDate),
        departmentId
      );
    } else {
      const query = {};
      if (departmentId) {
        query.$or = [
          { departments: { $size: 0 } },
          { departments: departmentId }
        ];
      }
      holidays = await PublicHoliday.find(query)
        .populate('departments', 'name')
        .populate('createdBy', 'name email')
        .sort({ date: 1 });
    }

    res.json({
      success: true,
      data: holidays
    });
  } catch (error) {
    console.error('❌ Get public holidays error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add public holiday
router.post('/public-holidays', auth, async (req, res) => {
  try {
    const { date, name, description, isPaidLeave, isOptional, departments } = req.body;

    const holiday = new PublicHoliday({
      date: new Date(date),
      name,
      description,
      isPaidLeave: isPaidLeave !== undefined ? isPaidLeave : true,
      isOptional: isOptional || false,
      departments: departments || [],
      createdBy: req.user.id
    });

    await holiday.save();

    res.json({
      success: true,
      message: 'Public holiday added successfully',
      data: holiday
    });
  } catch (error) {
    console.error('❌ Add public holiday error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update public holiday
router.put('/public-holidays/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { date, name, description, isPaidLeave, isOptional, departments } = req.body;

    const holiday = await PublicHoliday.findByIdAndUpdate(
      id,
      {
        date: date ? new Date(date) : undefined,
        name,
        description,
        isPaidLeave,
        isOptional,
        departments,
        updatedAt: Date.now()
      },
      { new: true, runValidators: true }
    );

    if (!holiday) {
      return res.status(404).json({
        success: false,
        error: 'Holiday not found'
      });
    }

    res.json({
      success: true,
      message: 'Public holiday updated successfully',
      data: holiday
    });
  } catch (error) {
    console.error('❌ Update public holiday error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete public holiday
router.delete('/public-holidays/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const holiday = await PublicHoliday.findByIdAndDelete(id);

    if (!holiday) {
      return res.status(404).json({
        success: false,
        error: 'Holiday not found'
      });
    }

    res.json({
      success: true,
      message: 'Public holiday deleted successfully'
    });
  } catch (error) {
    console.error('❌ Delete public holiday error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== PAID LEAVE MANAGEMENT ====================

// Get paid leaves
router.get('/paid-leaves', auth, async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.query;
    
    const query = {};
    if (userId) query.user = userId;
    if (startDate && endDate) {
      query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const leaves = await PaidLeaveConfig.find(query)
      .populate('user', 'name email department')
      .populate('approvedBy', 'name email')
      .populate('createdBy', 'name email')
      .sort({ date: -1 });

    res.json({
      success: true,
      data: leaves
    });
  } catch (error) {
    console.error('❌ Get paid leaves error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add paid leave
router.post('/paid-leaves', auth, async (req, res) => {
  try {
    const { userId, date, hours, leaveType, reason, countAsWorking, remarks } = req.body;

    // Check if leave already exists for this user and date
    const existingLeave = await PaidLeaveConfig.findOne({
      user: userId,
      date: new Date(date)
    });

    if (existingLeave) {
      return res.status(400).json({
        success: false,
        error: 'Paid leave already exists for this date'
      });
    }

    const leave = new PaidLeaveConfig({
      user: userId,
      date: new Date(date),
      hours: hours || 8,
      leaveType: leaveType || 'Paid Leave',
      reason,
      countAsWorking: countAsWorking !== undefined ? countAsWorking : true,
      isApproved: true,
      approvedBy: req.user.id,
      createdBy: req.user.id,
      remarks
    });

    await leave.save();

    res.json({
      success: true,
      message: 'Paid leave added successfully',
      data: leave
    });
  } catch (error) {
    console.error('❌ Add paid leave error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update paid leave
router.put('/paid-leaves/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { hours, leaveType, reason, countAsWorking, isApproved, remarks } = req.body;

    const leave = await PaidLeaveConfig.findByIdAndUpdate(
      id,
      {
        hours,
        leaveType,
        reason,
        countAsWorking,
        isApproved,
        remarks,
        updatedAt: Date.now()
      },
      { new: true, runValidators: true }
    );

    if (!leave) {
      return res.status(404).json({
        success: false,
        error: 'Paid leave not found'
      });
    }

    res.json({
      success: true,
      message: 'Paid leave updated successfully',
      data: leave
    });
  } catch (error) {
    console.error('❌ Update paid leave error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete paid leave
router.delete('/paid-leaves/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const leave = await PaidLeaveConfig.findByIdAndDelete(id);

    if (!leave) {
      return res.status(404).json({
        success: false,
        error: 'Paid leave not found'
      });
    }

    res.json({
      success: true,
      message: 'Paid leave deleted successfully'
    });
  } catch (error) {
    console.error('❌ Delete paid leave error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== EMPLOYEE HOURLY RATE MANAGEMENT ====================

// Update employee hourly rate
router.put('/employee-hourly-rate/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { hourlyRate, monthlySalary, salaryType } = req.body;

    let employee = await EmployeeMaster.findOne({ user: userId });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Employee master record not found'
      });
    }

    if (hourlyRate !== undefined) employee.hourlyRate = hourlyRate;
    if (monthlySalary !== undefined) employee.monthlySalary = monthlySalary;
    if (salaryType) employee.salaryType = salaryType;

    await employee.save();

    res.json({
      success: true,
      message: 'Employee hourly rate updated successfully',
      data: {
        hourlyRate: employee.hourlyRate,
        monthlySalary: employee.monthlySalary,
        salaryType: employee.salaryType,
        calculatedHourlyRate: employee.calculatedHourlyRate
      }
    });
  } catch (error) {
    console.error('❌ Update hourly rate error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get employee hourly rates
router.get('/employee-hourly-rates', auth, async (req, res) => {
  try {
    const { departmentId } = req.query;
    const query = { isActive: true };
    
    if (departmentId) {
      query.department = departmentId;
    }

    const employees = await EmployeeMaster.find(query)
      .populate('user', 'name email')
      .populate('department', 'name')
      .select('user employeeId name hourlyRate monthlySalary salaryType standardShiftHours standardWorkingDays')
      .sort({ name: 1 });

    const data = employees.map(emp => ({
      userId: emp.user?._id,
      employeeId: emp.employeeId,
      name: emp.name,
      email: emp.user?.email,
      department: emp.department?.name,
      hourlyRate: emp.hourlyRate,
      monthlySalary: emp.monthlySalary,
      salaryType: emp.salaryType,
      calculatedHourlyRate: emp.calculatedHourlyRate,
      standardShiftHours: emp.standardShiftHours,
      standardWorkingDays: emp.standardWorkingDays
    }));

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('❌ Get hourly rates error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

