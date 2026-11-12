const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs').promises;
const path = require('path');
const moment = require('moment');
const workingHoursCalculator = require('../services/workingHoursCalculator');
const DailyAttendance = require('../models/DailyAttendance');
const User = require('../models/User');
const Aim = require('../models/Aim');

// Configure multer for biometric file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/biometric');
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'biometric-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) and CSV files are allowed!'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
}).single('file');

// Export upload middleware for use in routes
exports.uploadMiddleware = upload;

/**
 * Parse biometric Excel file
 */
const parseBiometricFile = async (filePath) => {
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON with raw values to see structure
    const rawData = xlsx.utils.sheet_to_json(worksheet, { 
      raw: false,
      defval: '',
      header: 1 // Get as array of arrays first
    });
    
    console.log('Total rows in raw data:', rawData.length);
    console.log('First 5 rows:', rawData.slice(0, 5));
    
    // Find the header row (look for common attendance columns)
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(10, rawData.length); i++) {
      const row = rawData[i];
      const rowStr = JSON.stringify(row).toLowerCase();
      if (rowStr.includes('emp') || rowStr.includes('employee') || 
          (rowStr.includes('name') && rowStr.includes('date'))) {
        headerRowIndex = i;
        console.log('Found header at row:', i, row);
        break;
      }
    }
    
    if (headerRowIndex === -1) {
      // If no header found, assume row 0 is header
      headerRowIndex = 0;
    }
    
    // Convert to JSON using the found header row
    const data = xlsx.utils.sheet_to_json(worksheet, { 
      raw: false,
      defval: '',
      range: headerRowIndex // Start from header row
    });
    
    console.log('Parsed data count:', data.length);
    console.log('Sample parsed row:', data[0]);
    
    return data;
  } catch (error) {
    throw new Error('Failed to parse biometric file: ' + error.message);
  }
};

/**
 * Format date from various formats
 */
const parseDate = (dateInput) => {
  if (!dateInput) return null;
  
  try {
    // Handle Excel serial date numbers
    if (typeof dateInput === 'number') {
      const excelEpoch = new Date(1899, 11, 30);
      return moment(excelEpoch.getTime() + dateInput * 86400000);
    }
    
    return moment(dateInput);
  } catch (error) {
    console.error('Error parsing date:', dateInput, error);
    return null;
  }
};

/**
 * Upload biometric data and integrate with live attendance
 * POST /api/salary/upload-biometric
 */
exports.uploadBiometricData = async (req, res) => {
  console.log('Upload endpoint hit');
  console.log('req.file:', req.file);
  console.log('req.body:', req.body);
  console.log('Content-Type:', req.headers['content-type']);
  
  if (!req.file) {
    return res.status(400).json({ 
      success: false, 
      message: 'Please upload a file' 
    });
  }
  
  const filePath = req.file.path;
  
  try {
    // Parse biometric file
    const biometricData = await parseBiometricFile(filePath);
      
      if (!biometricData || biometricData.length === 0) {
        throw new Error('No data found in the uploaded file');
      }

      console.log('Total rows in file:', biometricData.length);
      console.log('Sample row columns:', biometricData[0] ? Object.keys(biometricData[0]) : 'No rows');
      console.log('First row data:', biometricData[0]);

      const processedRecords = [];
      const errors = [];

      // Process each biometric record
      for (const row of biometricData) {
        try {
          // Extract employee ID (support multiple column names) - case insensitive
          const rowKeys = Object.keys(row);
          const employeeIdKey = rowKeys.find(k => 
            /emp.*id|employee.*id|emp.*no|employee.*no|emp code|staff.*id/i.test(k)
          );
          const nameKey = rowKeys.find(k => 
            /^name$|emp.*name|employee.*name|staff.*name/i.test(k)
          );
          const dateKey = rowKeys.find(k => 
            /date|att.*date|attendance.*date/i.test(k)
          );
          const punchInKey = rowKeys.find(k => 
            /punch.*in|check.*in|in.*time|time.*in|start.*time/i.test(k)
          );
          const punchOutKey = rowKeys.find(k => 
            /punch.*out|check.*out|out.*time|time.*out|end.*time/i.test(k)
          );
          
          const employeeId = row[employeeIdKey] || row['Employee ID'] || row['EmployeeID'] || row['empId'] || row['ID'];
          const name = row[nameKey] || row['Name'] || row['Employee Name'] || row['EmployeeName'];
          const dateInput = row[dateKey] || row['Date'] || row['date'] || row['Attendance Date'];
          const punchIn = row[punchInKey] || row['Punch In'] || row['PunchIn'] || row['In Time'] || row['Check In'];
          const punchOut = row[punchOutKey] || row['Punch Out'] || row['PunchOut'] || row['Out Time'] || row['Check Out'];

          console.log('Processing row:', { employeeId, name, dateInput, punchIn, punchOut });

          if (!employeeId || !dateInput) {
            errors.push({ row, reason: 'Missing employee ID or date' });
            console.log('Skipping: Missing employee ID or date');
            continue;
          }

          // Find user
          const user = await User.findOne({ 
            $or: [
              { employeeId: employeeId },
              { email: employeeId }
            ]
          });

          if (!user) {
            errors.push({ employeeId, reason: 'User not found' });
            continue;
          }

          // Parse date
          const dateMoment = parseDate(dateInput);
          if (!dateMoment || !dateMoment.isValid()) {
            errors.push({ employeeId, date: dateInput, reason: 'Invalid date format' });
            continue;
          }

          const attendanceDate = dateMoment.startOf('day').toDate();

          // Parse biometric times
          let biometricTimeIn = null;
          let biometricTimeOut = null;

          if (punchIn && punchIn !== '' && punchIn !== '-') {
            const inTime = moment(dateMoment).startOf('day');
            const inMinutes = workingHoursCalculator.parseTimeToMinutes(punchIn);
            if (inMinutes !== null) {
              biometricTimeIn = inTime.clone().add(inMinutes, 'minutes').toDate();
            }
          }

          if (punchOut && punchOut !== '' && punchOut !== '-') {
            const outTime = moment(dateMoment).startOf('day');
            const outMinutes = workingHoursCalculator.parseTimeToMinutes(punchOut);
            if (outMinutes !== null) {
              biometricTimeOut = outTime.clone().add(outMinutes, 'minutes').toDate();
              
              // Handle midnight crossing
              if (biometricTimeIn && biometricTimeOut < biometricTimeIn) {
                biometricTimeOut = moment(biometricTimeOut).add(1, 'day').toDate();
              }
            }
          }

          // Find or create daily attendance record
          let attendanceRecord = await DailyAttendance.findOne({
            user: user._id,
            date: attendanceDate
          });

          if (!attendanceRecord) {
            attendanceRecord = new DailyAttendance({
              user: user._id,
              date: attendanceDate,
              isPresent: false,
              status: 'Absent',
              verificationMethod: 'Biometric'
            });
          }

          // Update biometric data
          attendanceRecord.biometricTimeIn = biometricTimeIn;
          attendanceRecord.biometricTimeOut = biometricTimeOut;
          
          // Calculate working hours using the new calculator (with 30 min allowance)
          if (biometricTimeIn && biometricTimeOut) {
            const hoursData = workingHoursCalculator.calculateWorkingHours(
              biometricTimeIn, 
              biometricTimeOut, 
              true // Apply 30-minute allowance
            );

            attendanceRecord.totalHoursWorked = hoursData.totalHours;
            attendanceRecord.regularHours = hoursData.regularHours;
            attendanceRecord.overtimeHours = hoursData.overtimeHours;
            attendanceRecord.isPresent = true;
            attendanceRecord.status = 'Present';
            
            // Set work location type - biometric data indicates office presence
            if (!attendanceRecord.startDayTime) {
              attendanceRecord.workLocationType = 'Office';
            } else if (attendanceRecord.startDayTime && !attendanceRecord.workLocationType) {
              attendanceRecord.workLocationType = 'Hybrid';
            }
          }

          // Update verification method
          if (attendanceRecord.startDayTime && attendanceRecord.biometricTimeIn) {
            attendanceRecord.verificationMethod = 'Both';
          } else if (attendanceRecord.biometricTimeIn) {
            attendanceRecord.verificationMethod = 'Biometric';
          }

          await attendanceRecord.save();
          processedRecords.push({
            employeeId,
            name: user.name,
            date: dateMoment.format('YYYY-MM-DD'),
            hoursWorked: attendanceRecord.totalHoursWorked,
            regularHours: attendanceRecord.regularHours,
            overtimeHours: attendanceRecord.overtimeHours
          });

        } catch (recordError) {
          console.error('Error processing biometric record:', recordError);
          errors.push({ 
            employeeId: row['Employee ID'] || row['EmployeeID'], 
            reason: recordError.message 
          });
        }
      }

      // Clean up uploaded file
      await fs.unlink(filePath);

      res.status(200).json({
        success: true,
        message: `Biometric data uploaded successfully. Processed ${processedRecords.length} records.`,
        data: {
          processedCount: processedRecords.length,
          errorCount: errors.length,
          records: processedRecords,
          errors: errors.length > 0 ? errors : undefined
        }
      });

    } catch (error) {
      console.error('Error uploading biometric data:', error);
      
      // Clean up file on error
      try {
        await fs.unlink(filePath);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
      
      res.status(500).json({
        success: false,
        message: 'Error processing biometric file: ' + error.message
      });
    }
};

/**
 * Calculate salary for an employee using live attendance data
 * GET /api/salary/calculate/:userId/:year/:month
 */
exports.calculateEmployeeSalary = async (req, res) => {
  try {
    const { userId, year, month } = req.params;

    // Validate inputs
    if (!userId || !year || !month) {
      return res.status(400).json({
        success: false,
        message: 'User ID, year, and month are required'
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Calculate monthly hours from live attendance
    const monthlyHours = await workingHoursCalculator.calculateMonthlyHours(
      userId,
      parseInt(year),
      parseInt(month)
    );

    // Get salary information
    const salaryInfo = {
      salaryMonthly: user.salary || null,
      salaryDaily: user.dailyRate || null,
      perHour: user.hourlyRate || 25 // Default hourly rate
    };

    // Calculate salary with the new calculator
    const salaryCalculation = workingHoursCalculator.calculateMonthlySalary(
      monthlyHours,
      salaryInfo
    );

    // Generate quality report
    const qualityReport = workingHoursCalculator.generateQualityReport(monthlyHours);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          employeeId: user.employeeId
        },
        ...salaryCalculation,
        qualityReport
      }
    });

  } catch (error) {
    console.error('Error calculating employee salary:', error);
    res.status(500).json({
      success: false,
      message: 'Error calculating salary: ' + error.message
    });
  }
};

/**
 * Get salary dashboard data for all employees
 * GET /api/salary/dashboard/:year/:month
 */
exports.getSalaryDashboard = async (req, res) => {
  try {
    const { year, month } = req.params;
    const { department, tag } = req.query;

    console.log('Dashboard request:', { year, month, department, tag });

    // Build user query - only get active regular users, excluding exited employees
    const userQuery = { role: 'User', stillExist: 1 };
    if (department) userQuery.department = department;
    if (tag) userQuery.tag = tag;

    // Find all users matching criteria
    const users = await User.find(userQuery)
      .select('_id name email employeeId salary hourlyRate department tag')
      .lean();

    console.log(`Found ${users.length} users for dashboard`);

    const salaryData = [];
    const errors = [];

    // Calculate salary for each user
    for (const user of users) {
      try {
        const monthlyHours = await workingHoursCalculator.calculateMonthlyHours(
          user._id,
          parseInt(year),
          parseInt(month)
        );

        console.log(`User ${user.name} monthly hours:`, monthlyHours.summary);

        const salaryInfo = {
          salaryMonthly: user.salary || null,
          salaryDaily: null,
          perHour: user.hourlyRate || 25
        };

        const salaryCalculation = workingHoursCalculator.calculateMonthlySalary(
          monthlyHours,
          salaryInfo
        );

        salaryData.push({
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            employeeId: user.employeeId,
            department: user.department,
            tag: user.tag
          },
          summary: salaryCalculation.summary,
          totalSalary: salaryCalculation.totalSalaryEarned,
          status: salaryCalculation.status,
          discrepancyCount: salaryCalculation.discrepancies.length
        });

      } catch (error) {
        console.error(`Error calculating salary for user ${user._id}:`, error);
        errors.push({
          userId: user._id,
          name: user.name,
          error: error.message
        });
      }
    }

    // Calculate aggregate statistics
    const stats = {
      totalEmployees: salaryData.length,
      totalSalary: salaryData.reduce((sum, s) => sum + s.totalSalary, 0),
      totalHours: salaryData.reduce((sum, s) => sum + s.summary.totalHoursWorked, 0),
      totalWFHDays: salaryData.reduce((sum, s) => sum + s.summary.wfhDays, 0),
      totalOfficeDays: salaryData.reduce((sum, s) => sum + s.summary.officeDays, 0),
      averageSalary: 0,
      averageHours: 0,
      employeesNeedingReview: salaryData.filter(s => s.status === 'needs_review').length
    };

    if (salaryData.length > 0) {
      stats.averageSalary = Math.round((stats.totalSalary / salaryData.length) * 100) / 100;
      stats.averageHours = Math.round((stats.totalHours / salaryData.length) * 100) / 100;
    }

    res.status(200).json({
      success: true,
      data: {
        period: {
          year: parseInt(year),
          month: parseInt(month),
          monthName: moment({ month: parseInt(month) - 1 }).format('MMMM')
        },
        stats,
        employees: salaryData,
        errors: errors.length > 0 ? errors : undefined
      }
    });

  } catch (error) {
    console.error('Error fetching salary dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching salary dashboard: ' + error.message
    });
  }
};

/**
 * Get detailed working hours breakdown for an employee
 * GET /api/salary/hours-breakdown/:userId/:year/:month
 */
exports.getHoursBreakdown = async (req, res) => {
  try {
    const { userId, year, month } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const monthlyHours = await workingHoursCalculator.calculateMonthlyHours(
      userId,
      parseInt(year),
      parseInt(month)
    );

    const qualityReport = workingHoursCalculator.generateQualityReport(monthlyHours);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email
        },
        ...monthlyHours,
        qualityReport
      }
    });

  } catch (error) {
    console.error('Error fetching hours breakdown:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching hours breakdown: ' + error.message
    });
  }
};

/**
 * Get WFH vs Office comparison for salary analysis
 * GET /api/salary/wfh-analysis/:userId/:year/:month
 */
exports.getWFHAnalysis = async (req, res) => {
  try {
    const { userId, year, month } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const monthlyHours = await workingHoursCalculator.calculateMonthlyHours(
      userId,
      parseInt(year),
      parseInt(month)
    );

    // Separate WFH and Office data
    const wfhDays = monthlyHours.dailyBreakdown.filter(d => d.workLocation === 'WFH' && d.isPresent);
    const officeDays = monthlyHours.dailyBreakdown.filter(d => d.workLocation === 'Office' && d.isPresent);

    const wfhStats = {
      totalDays: wfhDays.length,
      totalHours: wfhDays.reduce((sum, d) => sum + (d.totalHours || 0), 0),
      averageHours: 0,
      totalOvertimeHours: wfhDays.reduce((sum, d) => sum + (d.overtimeHours || 0), 0)
    };

    const officeStats = {
      totalDays: officeDays.length,
      totalHours: officeDays.reduce((sum, d) => sum + (d.totalHours || 0), 0),
      averageHours: 0,
      totalOvertimeHours: officeDays.reduce((sum, d) => sum + (d.overtimeHours || 0), 0)
    };

    if (wfhStats.totalDays > 0) {
      wfhStats.averageHours = Math.round((wfhStats.totalHours / wfhStats.totalDays) * 100) / 100;
    }

    if (officeStats.totalDays > 0) {
      officeStats.averageHours = Math.round((officeStats.totalHours / officeStats.totalDays) * 100) / 100;
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name
        },
        period: monthlyHours.period,
        wfh: wfhStats,
        office: officeStats,
        comparison: {
          wfhPercentage: Math.round((wfhStats.totalDays / (wfhStats.totalDays + officeStats.totalDays)) * 100),
          officePercentage: Math.round((officeStats.totalDays / (wfhStats.totalDays + officeStats.totalDays)) * 100),
          productivityDifference: Math.round((wfhStats.averageHours - officeStats.averageHours) * 100) / 100
        }
      }
    });

  } catch (error) {
    console.error('Error fetching WFH analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching WFH analysis: ' + error.message
    });
  }
};
