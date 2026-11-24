/**
 * Sample Biometric Data Generator
 * 
 * This script generates a sample Excel file with biometric attendance data
 * for testing the Salary Management System
 * 
 * Usage: node scripts/generate-sample-attendance.js
 */

const XLSX = require('xlsx');
const path = require('path');

// Configuration
const NUM_EMPLOYEES = 5;
const MONTH = 11; // November
const YEAR = 2025;
const DAYS_IN_MONTH = 30; // November has 30 days
const HOLIDAYS = [25, 26]; // Thanksgiving and day after (Nov 25-26)
const WEEKENDS = [1, 2, 8, 9, 15, 16, 22, 23, 29, 30]; // Saturdays and Sundays

// Employee data
const employees = [
  { id: 'EMP0001', name: 'Alex Taylor' },
  { id: 'EMP0002', name: 'Jordan Lee' },
  { id: 'EMP0003', name: 'Bob Johnson' },
  { id: 'EMP0004', name: 'Alice Williams' },
  { id: 'EMP0005', name: 'Charlie Brown' }
];

/**
 * Generate random time with some variation
 */
const generatePunchIn = () => {
  const hour = 8 + Math.floor(Math.random() * 2); // 8 AM to 9 AM
  const minute = Math.floor(Math.random() * 60);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const generatePunchOut = () => {
  const hour = 17 + Math.floor(Math.random() * 2); // 5 PM to 6 PM
  const minute = Math.floor(Math.random() * 60);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

/**
 * Check if day should be skipped
 */
const isWorkingDay = (day) => {
  return !WEEKENDS.includes(day) && !HOLIDAYS.includes(day);
};

/**
 * Format date
 */
const formatDate = (year, month, day) => {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/**
 * Generate attendance records
 */
const generateAttendanceData = () => {
  const records = [];
  
  for (const employee of employees) {
    for (let day = 1; day <= DAYS_IN_MONTH; day++) {
      if (isWorkingDay(day)) {
        // Randomly skip some days (sick leave, etc.)
        if (Math.random() > 0.95) continue;
        
        records.push({
          'Employee ID': employee.id,
          'Name': employee.name,
          'Date': formatDate(YEAR, MONTH, day),
          'Punch In': generatePunchIn(),
          'Punch Out': generatePunchOut()
        });
      }
    }
  }
  
  return records;
};

/**
 * Create and save Excel file
 */
const createExcelFile = () => {
  try {
    console.log('📊 Generating sample biometric attendance data...\n');
    
    const data = generateAttendanceData();
    
    console.log(`✅ Generated ${data.length} attendance records`);
    console.log(`   Employees: ${NUM_EMPLOYEES}`);
    console.log(`   Month: ${MONTH}/${YEAR}`);
    console.log(`   Working days: ${DAYS_IN_MONTH - WEEKENDS.length - HOLIDAYS.length}`);
    console.log(`   Holidays excluded: ${HOLIDAYS.join(', ')}`);
    console.log(`   Weekends excluded: Saturdays and Sundays\n`);
    
    // Create workbook and worksheet
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    
    // Save file
    const filename = `sample-attendance-${YEAR}-${String(MONTH).padStart(2, '0')}.xlsx`;
    const filepath = path.join(__dirname, '..', 'uploads', 'salary', filename);
    
    XLSX.writeFile(wb, filepath);
    
    console.log(`💾 File saved to: ${filepath}`);
    console.log('\n📋 Sample data preview:');
    console.log('━'.repeat(70));
    console.log(data.slice(0, 5).map((record, i) => 
      `${i + 1}. ${record['Employee ID']} - ${record.Name} - ${record.Date} - ${record['Punch In']} to ${record['Punch Out']}`
    ).join('\n'));
    console.log('...\n');
    
    console.log('✅ Sample file created successfully!');
    console.log('\n🚀 Next steps:');
    console.log('1. Upload this file through the Biometric Salary Management page');
    console.log('2. Verify salary calculations are correct');
    console.log('3. Test with different scenarios\n');
    
  } catch (error) {
    console.error('❌ Error creating sample file:', error);
    process.exit(1);
  }
};

/**
 * Create sample holidays file
 */
const createHolidaysJson = () => {
  const holidays = [
    {
      date: `${YEAR}-${String(MONTH).padStart(2, '0')}-25`,
      description: 'Thanksgiving Day',
      type: 'public'
    },
    {
      date: `${YEAR}-${String(MONTH).padStart(2, '0')}-26`,
      description: 'Day after Thanksgiving',
      type: 'company'
    }
  ];
  
  const fs = require('fs');
  const filepath = path.join(__dirname, '..', 'uploads', 'salary', 'sample-holidays.json');
  
  fs.writeFileSync(filepath, JSON.stringify(holidays, null, 2));
  console.log(`📅 Holiday list saved to: ${filepath}\n`);
};

// Run generator
if (require.main === module) {
  console.log('\n' + '='.repeat(70));
  console.log('  SAMPLE BIOMETRIC ATTENDANCE DATA GENERATOR');
  console.log('='.repeat(70) + '\n');
  
  createExcelFile();
  createHolidaysJson();
  
  console.log('='.repeat(70) + '\n');
}

module.exports = { generateAttendanceData, createExcelFile };
