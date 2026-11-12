
// const express = require("express")
// const router = express.Router()
// const jwt = require("jsonwebtoken")
// const User = require("../models/User")
// const authMiddleware = require("../middleware/auth")
// const mongoose = require("mongoose")
// const nodemailer = require("nodemailer")
// require('dotenv').config()


// // Create email transporter
// const transporter = nodemailer.createTransport({
//   service: process.env.EMAIL_SERVICE || "gmail",
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASSWORD,
//   },
// })
// // console.log(process.env.EMAIL_USER, process.env.EMAIL_PASSWORD)


// // Send role-specific welcome email
// const sendWelcomeEmail = async (user) => {
//   try {
//     const emailSubject = "Welcome to WorkflowAI Management System"
//     let emailContent = ""

//     // Customize email content based on user role
//     if (user.role === "Admin") {
//       emailContent = `
//         <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//           <h2 style="color: #3b82f6;">Welcome to WorkflowAI, ${user.name}!</h2>
//           <p>Your administrator account has been successfully created.</p>
          
//           <h3 style="color: #1f2937;">As an Administrator, you can:</h3>
//           <ul>
//             <li>Access the complete organization dashboard</li>
//             <li>Create and assign tasks to team members</li>
//             <li>Review task progress and completion status</li>
//             <li>Generate daily progress reports</li>
//             <li>Broadcast notifications to team members</li>
//             <li>Create and manage departments</li>
//           </ul>
          
//           <p>You can also use the "Broadcast Update Progress" button to send reminders to all users to update their task progress.</p>
          
//           <p>The system will automatically generate PDF progress reports that will be delivered to your email.</p>
          
//           <div style="margin-top: 20px;">
//             <a href="${process.env.FRONTEND_URL || "http://localhost:5173"}/dashboard" 
//                style="background-color: #3b82f6; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">
//               Go to Dashboard
//             </a>
//           </div>
          
//           <p style="margin-top: 20px; color: #6b7280; font-size: 0.9em;">
//             If you have any questions, please contact our support team.
//           </p>
//         </div>
//       `
//     } else if (user.role === "Manager") {
//       emailContent = `
//         <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//           <h2 style="color: #3b82f6;">Welcome to WorkflowAI, ${user.name}!</h2>
//           <p>Your manager account has been successfully created.</p>
          
//           <h3 style="color: #1f2937;">As a Manager, you can:</h3>
//           <ul>
//             <li>Access your department dashboard</li>
//             <li>Create and assign tasks to your team members</li>
//             <li>Review task progress and completion status</li>
//             <li>Generate department progress reports</li>
//             <li>Manage your department's workflow</li>
//           </ul>
          
//           <p>You'll receive daily email notifications about your team's progress and any tasks approaching deadlines.</p>
          
//           <div style="margin-top: 20px;">
//             <a href="${process.env.FRONTEND_URL || "http://localhost:5173"}/dashboard" 
//                style="background-color: #3b82f6; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">
//               Go to Dashboard
//             </a>
//           </div>
          
//           <p style="margin-top: 20px; color: #6b7280; font-size: 0.9em;">
//             If you have any questions, please contact the system administrator.
//           </p>
//         </div>
//       `
//     } else {
//       emailContent = `
//         <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//           <h2 style="color: #3b82f6;">Welcome to WorkflowAI, ${user.name}!</h2>
//           <p>Your account has been successfully created.</p>
          
//           <h3 style="color: #1f2937;">As a Team Member, you can:</h3>
//           <ul>
//             <li>View tasks assigned to you</li>
//             <li>Update your daily progress on tasks</li>
//             <li>Track your productivity and completion rates</li>
//             <li>Communicate blockers and achievements</li>
//           </ul>
          
//           <p><strong>Important:</strong> You will receive daily email reminders to update your task progress. Regular updates help the team track project status and identify any issues early.</p>
          
//           <p>Each day, please visit the Progress page to:</p>
//           <ul>
//             <li>Set your daily goals</li>
//             <li>Update your progress percentage</li>
//             <li>Note any blockers or challenges</li>
//             <li>Record key achievements</li>
//           </ul>
          
//           <div style="margin-top: 20px;">
//             <a href="${process.env.FRONTEND_URL || "http://localhost:5173"}/progress" 
//                style="background-color: #3b82f6; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">
//               Go to Progress Page
//             </a>
//           </div>
          
//           <p style="margin-top: 20px; color: #6b7280; font-size: 0.9em;">
//             If you have any questions, please contact your department manager.
//           </p>
//         </div>
//       `
//     }

//     const mailOptions = {
//       from: process.env.EMAIL_USER,
//       to: user.email,
//       subject: emailSubject,
//       html: emailContent,
//     }

//     await transporter.sendMail(mailOptions)
//     console.log(`Welcome email sent to ${user.email}`)
//     return true
//   } catch (error) {
//     console.error("Error sending welcome email:", error)
//     return false
//   }
// }

// // Register route
// router.post("/register", async (req, res) => {
//   const { name, email, password, role, department } = req.body

//   try {
//     // Check if user already exists
//     const userExists = await User.findOne({ email })
//     if (userExists) {
//       return res.status(400).json({ error: "User already exists" })
//     }

//     // Validate role
//     const validRoles = ["Admin", "Manager", "User"]
//     if (!validRoles.includes(role)) {
//       return res.status(400).json({ error: "Invalid role" })
//     }

//     // Validate and convert department if provided
//     let departmentId = undefined
//     if (department) {
//       if (mongoose.Types.ObjectId.isValid(department)) {
//         departmentId = new mongoose.Types.ObjectId(department)
//       } else {
//         return res.status(400).json({ error: "Invalid department ID" })
//       }
//     }

//     // Create new user
//     const newUser = new User({
//       name,
//       email,
//       password: password,
//       role,
//       ...(departmentId && { department: departmentId }),
//     })

//     await newUser.save()

//     // JWT payload
//     const payload = {
//       id: newUser.id,
//       name: newUser.name,
//       email: newUser.email,
//       role: newUser.role,
//       department: newUser.department,
//     }

//     // Generate JWT token
//     const token = jwt.sign(payload, process.env.JWT_SECRET || "jwtSecret", {
//       expiresIn: "1h",
//     })

//     // Send welcome email based on role
//     sendWelcomeEmail(newUser).catch((err) => {
//       console.error("Failed to send welcome email:", err)
//       // Continue with registration even if email fails
//     })

//     res.status(201).json({ token, user: payload })
//   } catch (error) {
//     console.error("Registration error:", error)
//     res.status(500).json({ error: "Server error" })
//   }
// })

// // Login route
// router.post("/login", async (req, res) => {
//   const { email, password } = req.body

//   try {
//     // Find the user by email
//     const user = await User.findOne({ email })
//     if (!user) {
//       return res.status(400).json({ error: "Invalid credentials" })
//     }

//     // Check password directly
//     if (password !== user.password) {
//       return res.status(400).json({ error: "Invalid credentials" })
//     }

//     // Create JWT payload
//     const payload = {
//       id: user.id,
//       name: user.name,
//       email: user.email,
//       role: user.role,
//       department: user.department,
//     }

//     // Generate JWT token
//     const token = jwt.sign(payload, process.env.JWT_SECRET || "jwtSecret", {
//       expiresIn: "1h",
//     })

//     res.json({ token, user: payload })
//   } catch (error) {
//     console.error("Login error:", error)
//     res.status(500).json({ error: "Server error" })
//   }
// })

// // Protected route to get user data
// router.get("/me", authMiddleware, async (req, res) => {
//   try {
//     const user = await User.findById(req.user.id).select("-password")
//     if (!user) {
//       return res.status(404).json({ error: "User not found" })
//     }
//     res.json(user)
//   } catch (error) {
//     console.error("Error fetching user:", error)
//     res.status(500).json({ error: "Server error" })
//   }
// })

// module.exports = router




const express = require("express")
const router = express.Router()
const jwt = require("jsonwebtoken")
const User = require("../models/User")
const Department = require("../models/Department")
const authMiddleware = require("../middleware/auth")
const mongoose = require("mongoose")
const nodemailer = require("nodemailer")
const { isValidOrgEmail, ORG_EMAIL_ERROR } = require("../utils/orgEmail")
const { signalUserLogin, signalUserLogout, signalSessionResume, signalTaskCreated } = require("../services/karmaClient")
const emsSignals = require("../services/ems_signals")
require('dotenv').config()


// Create email transporter
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
})
// console.log(process.env.EMAIL_USER, process.env.EMAIL_PASSWORD)


// Send role-specific welcome email
const sendWelcomeEmail = async (user) => {
  try {
    const emailSubject = "Welcome to WorkflowAI Management System"
    let emailContent = ""

    // Customize email content based on user role
    if (user.role === "Admin") {
      emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3b82f6;">Welcome to WorkflowAI, ${user.name}!</h2>
          <p>Your administrator account has been successfully created.</p>
          
          <h3 style="color: #1f2937;">As an Administrator, you can:</h3>
          <ul>
            <li>Access the complete organization dashboard</li>
            <li>Create and assign tasks to team members</li>
            <li>Review task progress and completion status</li>
            <li>Generate daily progress reports</li>
            <li>Broadcast notifications to team members</li>
            <li>Create and manage departments</li>
          </ul>
          
          <p>You can also use the "Broadcast Update Progress" button to send reminders to all users to update their task progress.</p>
          
          <p>The system will automatically generate PDF progress reports that will be delivered to your email.</p>
          
          <div style="margin-top: 20px;">
            <a href="${process.env.FRONTEND_URL || "http://localhost:5173"}/dashboard" 
               style="background-color: #3b82f6; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">
              Go to Dashboard
            </a>
          </div>
          
          <p style="margin-top: 20px; color: #6b7280; font-size: 0.9em;">
            If you have any questions, please contact our support team.
          </p>
        </div>
      `
    } else if (user.role === "Manager") {
      emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3b82f6;">Welcome to WorkflowAI, ${user.name}!</h2>
          <p>Your manager account has been successfully created.</p>
          
          <h3 style="color: #1f2937;">As a Manager, you can:</h3>
          <ul>
            <li>Access your department dashboard</li>
            <li>Create and assign tasks to your team members</li>
            <li>Review task progress and completion status</li>
            <li>Generate department progress reports</li>
            <li>Manage your department's workflow</li>
          </ul>
          
          <p>You'll receive daily email notifications about your team's progress and any tasks approaching deadlines.</p>
          
          <div style="margin-top: 20px;">
            <a href="${process.env.FRONTEND_URL || "http://localhost:5173"}/dashboard" 
               style="background-color: #3b82f6; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">
              Go to Dashboard
            </a>
          </div>
          
          <p style="margin-top: 20px; color: #6b7280; font-size: 0.9em;">
            If you have any questions, please contact the system administrator.
          </p>
        </div>
      `
    } else {
      emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3b82f6;">Welcome to WorkflowAI, ${user.name}!</h2>
          <p>Your account has been successfully created.</p>
          
          <h3 style="color: #1f2937;">As a Team Member, you can:</h3>
          <ul>
            <li>View tasks assigned to you</li>
            <li>Update your daily progress on tasks</li>
            <li>Track your productivity and completion rates</li>
            <li>Communicate blockers and achievements</li>
          </ul>
          
          <p><strong>Important:</strong> You will receive daily email reminders to update your task progress. Regular updates help the team track project status and identify any issues early.</p>
          
          <p>Each day, please visit the Progress page to:</p>
          <ul>
            <li>Set your daily goals</li>
            <li>Update your progress percentage</li>
            <li>Note any blockers or challenges</li>
            <li>Record key achievements</li>
          </ul>
          
          <div style="margin-top: 20px;">
            <a href="${process.env.FRONTEND_URL || "http://localhost:5173"}/progress" 
               style="background-color: #3b82f6; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">
              Go to Progress Page
            </a>
          </div>
          
          <p style="margin-top: 20px; color: #6b7280; font-size: 0.9em;">
            If you have any questions, please contact your department manager.
          </p>
        </div>
      `
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: emailSubject,
      html: emailContent,
    }

    await transporter.sendMail(mailOptions)
    console.log(`Welcome email sent to ${user.email}`)
    return true
  } catch (error) {
    console.error("Error sending welcome email:", error)
    return false
  }
}

// Register route
router.post("/register", async (req, res) => {
  const { name, email, password, role, department, branch } = req.body

  try {
    if (!isValidOrgEmail(email)) {
      return res.status(400).json({ error: ORG_EMAIL_ERROR })
    }

    // Check if user already exists
    const userExists = await User.findOne({ email })
    if (userExists) {
      return res.status(400).json({ error: "User already exists" })
    }

    // Validate role
    const validRoles = ["Admin", "Manager", "User", "Tester"]
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role" })
    }

    // Validate and convert department if provided
    let departmentId = undefined
    if (department) {
      if (mongoose.Types.ObjectId.isValid(department)) {
        departmentId = new mongoose.Types.ObjectId(department)
      } else {
        return res.status(400).json({ error: "Invalid department ID" })
      }
    }

    // Create new user with branch
    const newUser = new User({
      name,
      email,
      password: password,
      role,
      branch: branch || 'blackhole_mumbai', // Default to blackhole_mumbai if not provided
      ...(departmentId && { department: departmentId }),
    })

    await newUser.save()

    // Add the new user to the department's members array if a department is specified
    if (departmentId) {
      await Department.findByIdAndUpdate(
        departmentId,
        { $push: { members: newUser._id } },
        { new: true }
      )
    }

    // JWT payload
    const payload = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      department: newUser.department,
      branch: newUser.branch,
    }

    // Generate JWT token
    const token = jwt.sign(payload, process.env.JWT_SECRET || "jwtSecret", {
      expiresIn: "180d",
    })

    // Send welcome email based on role
    sendWelcomeEmail(newUser).catch((err) => {
      console.error("Failed to send welcome email:", err)
      // Continue with registration even if email fails
    })

    const cookieOptions = {
      domain: process.env.COOKIE_DOMAIN || ".blackholeinfiverse.com",
      path: "/",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 180 * 24 * 60 * 60 * 1000,
    };
    try {
      res.cookie("WorkflowToken", token, cookieOptions);
      res.cookie("x-auth-token", token, cookieOptions);
    } catch (e) {}

    res.status(201).json({ token, user: payload })

    // Fire-and-forget PRANA & KARMA signals — registration counts as first login
    const sessionId = `sess_${Date.now()}`;
    try { emsSignals.initializeEmployee(String(newUser._id), sessionId); } catch(e) {}
    signalUserLogin(String(newUser._id)).catch(() => {});
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Login route
router.post("/login", async (req, res) => {
  const { email, password } = req.body

  try {
    // Find the user by email
    const user = await User.findOne({ email })
    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" })
    }

    // Check if user has exited the company
    if (user.stillExist === 0) {
      return res.status(403).json({ 
        error: "Your account has been deactivated (marked as exited). Please contact HR/Administrator.",
        code: "ACCOUNT_DEACTIVATED" 
      });
    }

    // Check password directly
    if (password !== user.password) {
      return res.status(400).json({ error: "Invalid credentials" })
    }

    // Create JWT payload
    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      branch: user.branch || 'blackhole_mumbai',
    }

    // Generate JWT token
    const token = jwt.sign(payload, process.env.JWT_SECRET || "jwtSecret", {
      expiresIn: "180d",
    })

    const cookieOptions = {
      domain: process.env.COOKIE_DOMAIN || ".blackholeinfiverse.com",
      path: "/",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 180 * 24 * 60 * 60 * 1000,
    };
    try {
      res.cookie("WorkflowToken", token, cookieOptions);
      res.cookie("x-auth-token", token, cookieOptions);
    } catch (e) {}

    res.json({ token, user: payload })

    // Fire-and-forget PRANA & KARMA signals
    const sessionId = `sess_${Date.now()}`;
    try { emsSignals.initializeEmployee(String(user._id), sessionId); } catch(e) {}
    signalUserLogin(String(user._id)).catch(() => {});
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Logout route — emits PRANA and KARMA lifecycle signals
router.post("/logout", authMiddleware, async (req, res) => {
  try { emsSignals.stopTracking(String(req.user.id)); } catch(e) {}
  signalUserLogout(String(req.user.id)).catch(() => {});
  res.json({ message: "Logged out" });
})

// Verify admin password for branch switching
router.post("/verify-password", authMiddleware, async (req, res) => {
  const { password } = req.body

  try {
    // Only allow admin users
    if (req.user.role !== "Admin") {
      return res.status(403).json({ error: "Access denied. Admin only." })
    }

    if (!password) {
      return res.status(400).json({ error: "Password is required" })
    }

    // Find the user by ID
    const user = await User.findById(req.user.id)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Check password directly
    if (password !== user.password) {
      return res.status(400).json({ error: "Invalid password" })
    }

    res.json({ success: true, message: "Password verified successfully" })
  } catch (error) {
    console.error("Password verification error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Protected route to get user data & Session recovery
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password")
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // PRANA & KARMA Session Recovery after refresh
    const sessionId = `sess_rec_${Date.now()}`;
    try { emsSignals.initializeEmployee(String(user._id), sessionId); } catch(e) {}
    if (typeof signalSessionResume === 'function') {
      signalSessionResume(String(user._id)).catch(() => {});
    }

    res.json(user)
  } catch (error) {
    console.error("Error fetching user:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Forgot Password - Request password reset
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body

  try {
    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) {
      // Don't reveal if user exists or not for security
      return res.status(200).json({ 
        message: "If an account exists with this email, a password reset link has been sent." 
      })
    }

    // Generate reset token (random string)
    const resetToken = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || "jwtSecret",
      { expiresIn: "1h" } // Token expires in 1 hour
    )

    // Save reset token and expiry to user
    user.resetPasswordToken = resetToken
    user.resetPasswordExpires = Date.now() + 3600000 // 1 hour from now
    await user.save()

    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/reset-password/${resetToken}`

    // Send password reset email
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #3b82f6;">Password Reset Request</h2>
        <p>Hello ${user.name},</p>
        
        <p>We received a request to reset your password for your WorkflowAI account.</p>
        
        <p>Click the button below to reset your password:</p>
        
        <div style="margin: 30px 0; text-align: center;">
          <a href="${resetUrl}" 
             style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Reset Password
          </a>
        </div>
        
        <p>Or copy and paste this link into your browser:</p>
        <p style="background-color: #f3f4f6; padding: 10px; border-radius: 5px; word-break: break-all;">
          ${resetUrl}
        </p>
        
        <p><strong>This link will expire in 1 hour.</strong></p>
        
        <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        
        <p style="color: #6b7280; font-size: 0.9em;">
          This is an automated email. Please do not reply to this message.
        </p>
      </div>
    `

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Password Reset Request - WorkflowAI",
      html: emailContent,
    }

    await transporter.sendMail(mailOptions)
    console.log(`Password reset email sent to ${user.email}`)

    res.status(200).json({ 
      message: "If an account exists with this email, a password reset link has been sent." 
    })
  } catch (error) {
    console.error("Forgot password error:", error)
    res.status(500).json({ error: "Server error. Please try again later." })
  }
})

// Verify Reset Token - Check if token is valid
router.get("/verify-reset-token/:token", async (req, res) => {
  const { token } = req.params

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "jwtSecret")

    // Find user with this token
    const user = await User.findOne({
      _id: decoded.id,
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }, // Check if token hasn't expired
    })

    if (!user) {
      return res.status(400).json({ 
        error: "Password reset token is invalid or has expired." 
      })
    }

    res.status(200).json({ 
      message: "Token is valid",
      email: user.email 
    })
  } catch (error) {
    console.error("Verify reset token error:", error)
    res.status(400).json({ 
      error: "Password reset token is invalid or has expired." 
    })
  }
})

// Reset Password - Update password with valid token
router.post("/reset-password/:token", async (req, res) => {
  const { token } = req.params
  const { password } = req.body

  try {
    // Validate password
    if (!password || password.length < 6) {
      return res.status(400).json({ 
        error: "Password must be at least 6 characters long." 
      })
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "jwtSecret")

    // Find user with this token
    const user = await User.findOne({
      _id: decoded.id,
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    })

    if (!user) {
      return res.status(400).json({ 
        error: "Password reset token is invalid or has expired." 
      })
    }

    // Update password (stored as plain text as per your current implementation)
    user.password = password
    user.resetPasswordToken = undefined
    user.resetPasswordExpires = undefined
    await user.save()

    // Send confirmation email
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #10b981;">Password Successfully Reset</h2>
        <p>Hello ${user.name},</p>
        
        <p>Your password has been successfully reset.</p>
        
        <p>You can now log in to your account using your new password.</p>
        
        <div style="margin: 30px 0; text-align: center;">
          <a href="${process.env.FRONTEND_URL || "http://localhost:5173"}/login" 
             style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Go to Login
          </a>
        </div>
        
        <p>If you didn't make this change, please contact support immediately.</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        
        <p style="color: #6b7280; font-size: 0.9em;">
          This is an automated email. Please do not reply to this message.
        </p>
      </div>
    `

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Password Reset Confirmation - WorkflowAI",
      html: emailContent,
    }

    await transporter.sendMail(mailOptions).catch(err => {
      console.error("Failed to send confirmation email:", err)
    })

    console.log(`Password reset successful for ${user.email}`)

    res.status(200).json({ 
      message: "Password has been reset successfully. You can now log in with your new password." 
    })
  } catch (error) {
    console.error("Reset password error:", error)
    
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(400).json({ 
        error: "Password reset token is invalid or has expired." 
      })
    }
    
    res.status(500).json({ error: "Server error. Please try again later." })
  }
})

// Google OAuth removed: authentication uses email/password only

module.exports = router

