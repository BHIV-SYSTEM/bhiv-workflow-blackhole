require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Salary = require('../models/Salary');
const Attendance = require('../models/Attendance');
const Department = require('../models/Department');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/infiverse-bhl');

// Generate secure random password
function generatePassword() {
  return crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
}

const sampleDepartments = [
  { name: 'Engineering', description: 'Software Development', color: 'bg-blue-500' },
  { name: 'Marketing', description: 'Marketing and Sales', color: 'bg-green-500' },
  { name: 'HR', description: 'Human Resources', color: 'bg-purple-500' },
  { name: 'Finance', description: 'Finance and Accounting', color: 'bg-yellow-500' }
];

// Passwords will be generated at runtime
const sampleUsers = [
  {
    name: 'Alex Taylor',
    email: 'alex.taylor@company.com',
    role: 'User',
    departmentName: 'Engineering',
    employeeId: 'EMP001',
    tag: 'Employee'
  },
  {
    name: 'Jordan Lee',
    email: 'jordan.lee@company.com',
    role: 'User',
    departmentName: 'Marketing',
    employeeId: 'EMP002',
    tag: 'Employee'
  },
  {
    name: 'Mike Johnson',
    email: 'mike.johnson@company.com',
    role: 'User',
    departmentName: 'HR',
    employeeId: 'EMP003',
    tag: 'Employee'
  },
  {
    name: 'Sarah Wilson',
    email: 'sarah.wilson@company.com',
    role: 'User',
    departmentName: 'Finance',
    employeeId: 'EMP004',
    tag: 'Intern'
  },
  {
    name: 'Admin User',
    email: 'admin@company.com',
    role: 'Admin',
    departmentName: 'Engineering',
    employeeId: 'ADM001',
    tag: 'Employee'
  }
];

async function createSampleData() {
  try {
    console.log('🚀 Creating sample data...');

    // Create departments
    console.log('📁 Creating departments...');
    for (const deptData of sampleDepartments) {
      const existingDept = await Department.findOne({ name: deptData.name });
      if (!existingDept) {
        const department = new Department(deptData);
        await department.save();
        console.log(`✅ Created department: ${deptData.name}`);
      } else {
        console.log(`⏭️  Department already exists: ${deptData.name}`);
      }
    }

    // Create users
    console.log('👥 Creating users...');
    const createdUsers = [];
    const generatedCredentials = [];

    for (const userData of sampleUsers) {
      const existingUser = await User.findOne({ email: userData.email });

      if (!existingUser) {
        // Find department by name
        const department = await Department.findOne({ name: userData.departmentName });
        
        // Generate secure random password
        const password = generatePassword();

        const user = new User({
          name: userData.name,
          email: userData.email,
          password: password,
          role: userData.role,
          department: department ? department._id : null,
          employeeId: userData.employeeId,
          tag: userData.tag,
          isActive: true,
          createdAt: new Date()
        });

        await user.save();
        createdUsers.push(user);
        generatedCredentials.push({ email: userData.email, password, name: userData.name });
        console.log(`✅ Created user: ${userData.name} (${userData.email})`);
      } else {
        createdUsers.push(existingUser);
        console.log(`⏭️  User already exists: ${userData.name}`);
      }
    }

    // Print generated credentials (IMPORTANT: Save these securely!)
    if (generatedCredentials.length > 0) {
      console.log('\\n⚠️  IMPORTANT: Save these credentials securely!');
      console.log('==========================================');
      for (const cred of generatedCredentials) {
        console.log(`${cred.name}: ${cred.email} / ${cred.password}`);
      }
      console.log('==========================================\\n');
    }

    // Create salary records
    console.log('💰 Creating salary records...');
    for (const user of createdUsers) {
      const existingSalary = await Salary.findOne({ user: user._id });
      
      if (!existingSalary) {
        const baseSalary = user.tag === 'Intern' ? 
          Math.floor(Math.random() * 20000) + 20000 : // 20k-40k for interns
          Math.floor(Math.random() * 50000) + 50000;  // 50k-100k for employees
        
        const salaryData = {
          user: user._id,
          baseSalary: baseSalary,
          currency: 'USD',
          salaryType: 'Monthly',
          payGrade: user.tag === 'Intern' ? 'I1' : `L${Math.floor(Math.random() * 5) + 1}`,
          joiningDate: user.createdAt || new Date(),
          allowances: {
            housing: Math.floor(baseSalary * 0.1),
            transport: Math.floor(baseSalary * 0.05),
            medical: Math.floor(baseSalary * 0.08),
            other: Math.floor(baseSalary * 0.02)
          },
          deductions: {
            tax: Math.floor(baseSalary * 0.15),
            insurance: Math.floor(baseSalary * 0.03),
            providentFund: Math.floor(baseSalary * 0.12)
          },
          bankDetails: {
            accountNumber: `ACC${Math.floor(Math.random() * 1000000000)}`,
            bankName: ['Chase Bank', 'Wells Fargo', 'Bank of America', 'Citibank'][Math.floor(Math.random() * 4)],
            routingNumber: `${Math.floor(Math.random() * 900000000) + 100000000}`,
            ifscCode: `BANK${Math.floor(Math.random() * 10000)}`
          },
          probationPeriod: {
            duration: user.tag === 'Intern' ? 1 : 3,
            isCompleted: Math.random() > 0.3
          },
          isActive: true
        };

        const salary = new Salary(salaryData);
        await salary.save();
        console.log(`✅ Created salary record for: ${user.name} ($${baseSalary})`);
      } else {
        console.log(`⏭️  Salary record already exists for: ${user.name}`);
      }
    }

    // Create sample attendance records for the last 7 days
    console.log('📅 Creating attendance records...');
    const today = new Date();
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      for (const user of createdUsers) {
        const existingAttendance = await Attendance.findOne({
          user: user._id,
          date: {
            $gte: date,
            $lt: new Date(date.getTime() + 24 * 60 * 60 * 1000)
          }
        });
        
        if (!existingAttendance && Math.random() > 0.1) { // 90% attendance rate
          const startTime = new Date(date);
          startTime.setHours(8 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60)); // 8-10 AM
          
          const endTime = new Date(startTime);
          endTime.setHours(startTime.getHours() + 8 + Math.floor(Math.random() * 2)); // 8-10 hours
          
          const hoursWorked = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
          
          const attendanceData = {
            user: user._id,
            date: date,
            startDayTime: startTime,
            endDayTime: i === 0 && Math.random() > 0.5 ? null : endTime, // Some ongoing for today
            biometricTimeIn: new Date(startTime.getTime() + (Math.random() - 0.5) * 10 * 60 * 1000), // ±5 min
            biometricTimeOut: i === 0 && Math.random() > 0.5 ? null : new Date(endTime.getTime() + (Math.random() - 0.5) * 10 * 60 * 1000),
            hoursWorked: hoursWorked,
            overtimeHours: Math.max(0, hoursWorked - 8),
            isPresent: true,
            isLate: startTime.getHours() > 9 || (startTime.getHours() === 9 && startTime.getMinutes() > 15),
            isVerified: true,
            source: Math.random() > 0.5 ? 'Both' : 'StartDay',
            location: {
              latitude: 19.1663 + (Math.random() - 0.5) * 0.001,
              longitude: 72.8526 + (Math.random() - 0.5) * 0.001,
              address: 'Blackhole Infiverse, Kali Gali, Mumbai'
            },
            hasDiscrepancy: Math.random() > 0.8, // 20% chance of discrepancy
            employeeNotes: Math.random() > 0.7 ? 'Regular work day' : '',
            approvalStatus: 'Auto-Approved'
          };
          
          const attendance = new Attendance(attendanceData);
          await attendance.save();
        }
      }
    }
    
    console.log('✅ Sample attendance records created');

    // Summary
    const userCount = await User.countDocuments();
    const salaryCount = await Salary.countDocuments();
    const attendanceCount = await Attendance.countDocuments();
    const departmentCount = await Department.countDocuments();
    
    console.log('\n🎉 Sample data creation completed!');
    console.log('📊 Summary:');
    console.log(`   👥 Users: ${userCount}`);
    console.log(`   💰 Salary Records: ${salaryCount}`);
    console.log(`   📅 Attendance Records: ${attendanceCount}`);
    console.log(`   📁 Departments: ${departmentCount}`);
    console.log('\n🔑 Login Credentials: Printed above (save them securely!)');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error creating sample data:', error);
    process.exit(1);
  }
}

// Run the script
createSampleData();
