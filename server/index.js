// const express = require("express");
// const mongoose = require("mongoose");
// const cors = require("cors");
// const http = require("http");
// const socketIo = require("socket.io");
// const jwt = require("jsonwebtoken");
// const path = require("path");
// const userNotificationRoutes = require('./routes/user-notifications');
// const taskRoutes = require("./routes/tasks");
// const departmentRoutes = require("./routes/departments");
// const userRoutes = require("./routes/users");
// const authRoutes = require("./routes/auth");
// const aiRoutes = require("./routes/ai");
// const adminRoutes = require('./routes/admin');
// const dashboardRoutes = require('./routes/dashboard');
// const submissionRoutes = require('./routes/submission');
// const aiNewRoutes = require('./routes/aiRoutes');
// const progressRoutes = require('./routes/progress'); // Add this line
// const notificationRoutes = require('./routes/notifications'); // Add this line
// const aimRoutes = require('./routes/aims_unified');
// // const aiRoutePy = require('./routes/aiRoutePy')
// // Create Express app
// const app = express();

// // Create HTTP server and initialize Socket.IO
// const server = http.createServer(app);
// const io = socketIo(server, {
//   cors: {
//     origin: ['http://localhost:5173','http://192.168.1.2:5173','https://main-workflow.vercel.app'],  // Replace with your frontend's URL
//     methods: ['GET', 'POST'],
//     credentials: true,  // Allow credentials (cookies, HTTP authentication)
//   },
// });

// // CORS Configuration
// const corsOptions = {
//   origin: ['http://localhost:5173','http://192.168.1.2:5173','https://main-workflow.vercel.app'],  // Replace with your frontend's URL
//   methods: ['GET', 'POST', 'PUT', 'DELETE'],
//   credentials: true,  // Allow credentials (cookies, HTTP authentication)
// };
// app.use(cors(corsOptions));

// app.use(express.json());

// // Connect to MongoDB
// require('dotenv').config();  // Add this line at the top

// // Connect to MongoDB
// mongoose
//   .connect(process.env.MONGODB_URI, {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
//   })
//   .then(() => console.log("Connected to MongoDB"))
//   .catch((err) => console.error("MongoDB connection error:", err));


// // Socket.IO connection
// io.on("connection", (socket) => {
//   console.log("New client connected");

//   socket.on("join", (rooms) => {
//     if (Array.isArray(rooms)) {
//       rooms.forEach((room) => socket.join(room));
//     }
//   });

//   socket.on("disconnect", () => {
//     console.log("Client disconnected");
//   });
// });

// // Make io available to routes
// app.use((req, res, next) => {
//   req.io = io;
//   next();
// });

// app.get('/api/ping', (req, res) => {
//   res.json({ message: 'Pong!' });
// });


// // Serve static files from Vite build
// app.use(express.static(path.join(__dirname, '../client/dist')));

// // Serve frontend only for non-API routes
// app.get(/^\/(?!api).*/, (req, res) => {
//   res.sendFile(path.join(__dirname, '../client/dist/index.html'));
// });


// // Routes
// app.use("/api/tasks", taskRoutes);
// app.use("/api/departments", departmentRoutes);
// app.use("/api/users", userRoutes);
// app.use("/api/auth", authRoutes);
// app.use("/api/ai", aiRoutes);
// app.use("/api/admin", adminRoutes);
// app.use("/api/dashboard", dashboardRoutes);
// app.use("/api/submissions", submissionRoutes);
// app.use('/api/new/ai', aiNewRoutes);
// app.use('/api/progress', progressRoutes); // Add this line
// app.use('/api/notifications', notificationRoutes); // Add this line
// app.use('/api/aims', aimRoutes);
// app.use('/api/user-notifications', userNotificationRoutes);

// // app.use('/api/new/ai',aiRoutePy)



// // Error handling middleware
// app.use((err, req, res, next) => {
//   console.error(err.stack);
//   res.status(500).json({ error: "Something went wrong!" });
// });

// // Start server
// const PORT = process.env.PORT || 5000;
// server.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });


const express = require("express");
const compression = require("compression");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");
const path = require("path");
require("dotenv").config();

// ─────────────────────────────────────────────────────────────────────────────
// STARTUP ENVIRONMENT VALIDATION
// The server will not start without these variables.  All of them guard
// security boundaries — a missing value is always a misconfiguration, never
// a runtime degradation that should be silently absorbed.
// ─────────────────────────────────────────────────────────────────────────────
const REQUIRED_ENV = {
  JWT_SECRET:
    "Required to sign and verify user JWTs. Set to a long random secret.",
  TANTRA_EXECUTION_KEY:
    "Required to authenticate requests to the TANTRA execution gateway. " +
    "Set to a long random secret. Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  MONGODB_URI:
    "Required to connect to MongoDB. Set to a valid MongoDB connection string.",
};

const missingVars = Object.entries(REQUIRED_ENV)
  .filter(([key]) => !process.env[key])
  .map(([key, hint]) => `  ${key}: ${hint}`);

if (missingVars.length > 0) {
  console.error("❌ SERVER STARTUP ABORTED — required environment variables are missing:");
  missingVars.forEach((msg) => console.error(msg));
  console.error(
    "\nCopy server/.env.example to server/.env and fill in the missing values."
  );
  process.exit(1);
}
// ─────────────────────────────────────────────────────────────────────────────

const userNotificationRoutes = require('./routes/user-notifications');
const taskRoutes = require("./routes/tasks");
const departmentRoutes = require("./routes/departments");
const userRoutes = require("./routes/users");
const authRoutes = require("./routes/auth");
const aiRoutes = require("./routes/ai");
const adminRoutes = require('./routes/admin');
const dashboardRoutes = require('./routes/dashboard');
const dashboardFixedRoutes = require('./routes/dashboardFixed');
const submissionRoutes = require('./routes/submission');
const aiNewRoutes = require('./routes/aiRoutes');
const progressRoutes = require('./routes/progress'); // Add this line
const notificationRoutes = require('./routes/notifications'); // Add this line
const aimRoutes = require('./routes/aims_universal');
const pushRoutes = require('./routes/push'); // Add this line
const attendanceRoutes = require('./routes/attendance'); // New attendance routes
const enhancedAttendanceRoutes = require('./routes/enhancedAttendance'); // Enhanced attendance routes
const attendanceStatusRoutes = require('./routes/attendanceStatus'); // Attendance status routes for polling  
const agentActivityRoutes = require('./routes/agentActivity'); // Agent activity routes
const leaveRoutes = require('./routes/leave'); // New leave routes
const enhancedSalaryRoutes = require('./routes/enhancedSalary'); // Enhanced salary with live attendance
const consentRoutes = require('./routes/consent'); // Consent routes
const alertRoutes = require('./routes/alerts'); // Alert routes
const emsRoutes = require('./routes/ems'); // EMS automation routes
const procurementRoutes = require('./routes/procurement'); // Procurement routes
const chatbotRoutes = require('./routes/chatbot'); // Admin chatbot routes
const biometricAttendanceRoutes = require('./routes/biometricAttendance'); // Biometric attendance and salary routes
const hourlyBasedSalaryRoutes = require('./routes/hourlyBasedSalary'); // Hourly-based salary management
const newSalaryRoutes = require('./routes/newSalaryManagement'); // New salary management system
const branchRoutes = require('./routes/branchRoutes'); // Branch management routes
const projectRoutes = require('./routes/projects'); // Project management routes
const testerRoutes = require('./routes/tester'); // Tester routes
const tantraExecutionRoutes = require('./routes/tantraExecution'); // Deterministic execution participation routes
const taskIngestionRoutes = require('./routes/taskIngestion'); // Automated engineering task ingestion pipeline
const setuConvergenceRoutes = require('./routes/setuConvergence'); // SETU EOS Constitutional Convergence Core
const group2ContextRoutes = require('./routes/group2Context'); // Group 2 Science Context & SANSKAR layer
const knowledgeAdminRoutes = require('./routes/knowledgeAdmin'); // Knowledge Administration routes
const { startAttendancePersistenceCron, syncExistingAttendance } = require('./services/attendanceCronJobs'); // Attendance persistence cron
const { router: trinetraRouter, startTrinetraScheduler } = require('./routes/trinetra'); // TRINETRA AI layer
// Middleware imports
const auth = require('./middleware/auth');
const adminAuth = require('./middleware/adminAuth');
// const aiRoutePy = require('./routes/aiRoutePy')
// Create Express app
const app = express();
app.set("trust proxy", 1);

// Create HTTP server and initialize Socket.IO
// Baseline allowlist + FRONTEND_URL / CORS_ORIGIN from env (comma-separated supported)
const normalizeOrigin = (origin) => {
  try {
    return new URL(origin);
  } catch {
    return null;
  }
};

const buildOriginAllowlist = () => {
  const httpsHosts = new Set([
    "niyantran.blackholeinfiverse.com",
    "blackhole-workflow.vercel.app",
    "niyantrankendra.blackholeinfiverse.com",
  ]);
  const httpHostsWithPort = new Set([
    "localhost:5173",
    "localhost",
    "localhost:8000",
    "163.128.209.18:5176",
    "163.128.209.18",
  ]);
  const socketOrigins = [
    "https://niyantran.blackholeinfiverse.com",
    "https://blackhole-workflow.vercel.app",
    "niyantrankendra.blackholeinfiverse.com",
    "http://localhost:5173",
    "http://localhost:8000",
    "http://163.128.209.18:5176",
    "http://163.128.209.18",
  ];

  const envOrigins = [process.env.CORS_ORIGIN, process.env.FRONTEND_URL]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  for (const origin of envOrigins) {
    const parsed = normalizeOrigin(origin);
    if (!parsed) continue;

    const hostWithPort = parsed.port
      ? `${parsed.hostname}:${parsed.port}`
      : parsed.hostname;

    if (parsed.protocol === "https:") {
      httpsHosts.add(parsed.hostname);
    } else if (parsed.protocol === "http:") {
      httpHostsWithPort.add(hostWithPort);
      if (!parsed.port) {
        httpHostsWithPort.add(parsed.hostname);
      }
    }

    if (!socketOrigins.includes(origin)) {
      socketOrigins.push(origin);
    }
  }

  return { httpsHosts, httpHostsWithPort, socketOrigins };
};

const ALLOWED_ORIGIN_CONFIG = buildOriginAllowlist();
const ALLOWED_SOCKET_ORIGINS = ALLOWED_ORIGIN_CONFIG.socketOrigins;

const isAllowedOrigin = (origin) => {
  // Allow non-browser/server-to-server clients (Postman, cron, health checks)
  if (!origin) return true;

  const parsed = normalizeOrigin(origin);
  if (!parsed) return false;

  const hostWithPort = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;

  if (parsed.protocol === "https:" && ALLOWED_ORIGIN_CONFIG.httpsHosts.has(parsed.hostname)) {
    return true;
  }
  if (parsed.protocol === "http:" && ALLOWED_ORIGIN_CONFIG.httpHostsWithPort.has(hostWithPort)) {
    return true;
  }
  return false;
};

const corsOptions = {
  origin(origin, callback) {
    // Do not throw from CORS callback; false keeps response stable without crashing the request pipeline.
    return callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "x-auth-token",
    "Authorization",
    "X-Branch",
    "x-branch",
    "X-Execution-Id",
    "x-execution-id",
    "X-Trace-Id",
    "x-trace-id",
    "X-Execution-Key",
    "x-execution-key",
    "X-Tenant-Id",
    "x-tenant-id",
    "X-Governance-Route",
    "x-governance-route",
    "X-Governance-Policy",
    "x-governance-policy",
    "X-Governance-Authority",
    "x-governance-authority",
    "X-Governance-Signature",
    "x-governance-signature",
    "X-CLIENT-TIMESTAMP",
    "x-client-timestamp",
    "X-Pravesh-Token",
    "x-pravesh-token",
  ],
  optionsSuccessStatus: 204,
};

// CORS must be at the very top before any routes/static handlers
app.use(cors(corsOptions));
try {
  // Requested global preflight handler
  app.options(/.*/, cors(corsOptions));
} catch (err) {
  // Express/path-to-regexp compatibility fallback
  app.options(/.*/, cors(corsOptions));
}

// Proxy-safe explicit CORS headers for allowed origins.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, x-auth-token, Authorization, X-Branch, x-branch, X-Execution-Id, x-execution-id, X-Trace-Id, x-trace-id, X-Execution-Key, x-execution-key, X-Tenant-Id, x-tenant-id, X-Governance-Route, x-governance-route, X-Governance-Policy, x-governance-policy, X-Governance-Authority, x-governance-authority, X-Governance-Signature, x-governance-signature, X-Pravesh-Token, x-pravesh-token"
    );
  }
  next();
});

// Middleware to allow iframe embedding inside SETU Dashboard & Production Domains
app.use((req, res, next) => {
  const allowedAncestors = [
    "'self'",
    "https://setu.blackholeinfiverse.com",
    "https://ai-crm-sigma-five.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000"
  ];
  res.setHeader('Content-Security-Policy', `frame-ancestors ${allowedAncestors.join(' ')}`);
  res.removeHeader('X-Frame-Options');
  next();
});

// Enable gzip/deflate compression for all HTTP responses
app.use(compression());

// TRINETRA screenshot ingest posts a compressed JPEG as base64, so the global body
// limit is raised from Express' 100kb default. Everything else is unchanged.
app.use(express.json({ limit: process.env.REQUEST_BODY_LIMIT || '8mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ALLOWED_SOCKET_ORIGINS,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "x-auth-token",
      "Authorization",
      "X-Branch",
      "x-branch",
    ],
  },
  transports: ["websocket", "polling"],
});

// Socket.IO connection
io.on("connection", (socket) => {
  console.log("✅ New client connected:", socket.id);

  socket.on("join", (rooms) => {
    if (Array.isArray(rooms)) {
      rooms.forEach((room) => {
        socket.join(room);
        console.log(`👤 Socket ${socket.id} joined room: ${room}`);
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

// Make io available to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

app.get('/api/ping', (req, res) => {
  res.json({ message: 'Pong!' });
});

// Test Linux browser detection endpoint
app.get('/api/test-browser-detection', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);

    console.log('🧪 Testing Linux browser detection...');

    const results = {};

    // Test if commands are installed
    try {
      await execAsync('which xdotool');
      results.xdotool = 'installed';
      console.log('✅ xdotool is installed');
    } catch (error) {
      results.xdotool = 'not installed: ' + error.message;
      console.log('❌ xdotool not installed:', error.message);
    }

    try {
      await execAsync('which wmctrl');
      results.wmctrl = 'installed';
      console.log('✅ wmctrl is installed');
    } catch (error) {
      results.wmctrl = 'not installed: ' + error.message;
      console.log('❌ wmctrl not installed:', error.message);
    }

    try {
      await execAsync('which scrot');
      results.scrot = 'installed';
      console.log('✅ scrot is installed');
    } catch (error) {
      results.scrot = 'not installed: ' + error.message;
      console.log('❌ scrot not installed:', error.message);
    }

    try {
      await execAsync('which convert');
      results.imagemagick = 'installed';
      console.log('✅ imagemagick is installed');
    } catch (error) {
      results.imagemagick = 'not installed: ' + error.message;
      console.log('❌ imagemagick not installed:', error.message);
    }

    // Test X11 environment
    try {
      const { stdout } = await execAsync('echo $DISPLAY');
      results.display = stdout.trim() || 'not set';
      console.log('🖥️ DISPLAY environment:', results.display);
    } catch (error) {
      results.display = 'error: ' + error.message;
    }

    res.json({
      success: true,
      platform: process.platform,
      commands: results,
      message: 'Linux command test completed'
    });

  } catch (error) {
    console.error('🧪 Command test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      platform: process.platform
    });
  }
});


// Docs endpoint to dynamically inspect and return all registered API routes
app.get('/docs', (req, res) => {
  const list = [];

  function traverse(router, basePath = '') {
    if (!router || !router.stack) return;
    router.stack.forEach(layer => {
      if (layer.route) {
        // Simple route registered directly on this router
        const routePath = (basePath + layer.route.path).replace(/\/+/g, '/');
        const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase());
        methods.forEach(method => {
          list.push({ method, path: routePath });
        });
      } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
        // Nested router middleware
        let prefix = '';
        if (layer.regexp) {
          prefix = layer.regexp.source
            .replace('^\\/', '/')
            .replace('\\/?(?=\\/|$)', '')
            .replace('\\/?$', '')
            .replace(/\\/g, '');
        }
        traverse(layer.handle, basePath + prefix);
      }
    });
  }

  traverse(app._router, '');

  // Filter out any duplicates and sort alphabetically by path
  const uniqueList = [];
  const seen = new Set();
  list.forEach(item => {
    const key = `${item.method}:${item.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueList.push(item);
    }
  });

  uniqueList.sort((a, b) => a.path.localeCompare(b.path));

  res.json({
    message: "Niyantran Workflow Server API Live Endpoint Catalog",
    version: "1.0.0",
    total_endpoints: uniqueList.length,
    endpoints: uniqueList
  });
});


// Serve static files from Vite build if present
const clientDistPath = path.join(__dirname, '../client/dist');
const fs = require('fs');

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get(/^\/(?!(api|uploads)).*/, (req, res) => {
    const indexPath = path.join(clientDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.json({ message: "Niyantran Workflow Server API is running." });
    }
  });
} else {
  // If static folder is not built locally or not present in standalone api deployments
  app.get('/', (req, res) => {
    res.json({ message: "Niyantran Workflow Server API is running." });
  });
}


// Routes
app.use("/api/tasks", taskRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/pravesh", require("./routes/pravesh")); // Pravesh (blackhole_auth) SSO bridge — read-only
app.use("/api/ai", aiRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/dashboard", dashboardFixedRoutes); // Enhanced dashboard APIs (attendance-summary, merge-analysis, etc.)
app.use("/api/submissions", submissionRoutes);
app.use('/api/new/ai', aiNewRoutes);
app.use('/api/progress', progressRoutes); // Add this line
app.use('/api/notifications', notificationRoutes); // Add this line
app.use('/api/aims', aimRoutes);
app.use('/api/user-notifications', userNotificationRoutes);
app.use("/api/push", pushRoutes) // Added push routes use
app.use("/api/monitoring", require("./routes/monitoring")); // Employee monitoring routes
app.use("/api/attendance", attendanceRoutes); // Attendance management routes
app.use("/api/enhanced-attendance", enhancedAttendanceRoutes); // Enhanced attendance routes
app.use("/api/attendance", attendanceStatusRoutes); // Electron agent polling endpoint (/api/attendance/status)
app.use("/api/agent", agentActivityRoutes); // Desktop agent activity ingestion
app.use("/api/trinetra", trinetraRouter); // TRINETRA AI layer (additive: telemetry, scoring, verification, alerts)
app.use("/api/attendance-dashboard", require("./routes/attendanceDashboard")); // Live attendance dashboard routes
app.use("/api/leave", leaveRoutes); // Leave management routes
app.use("/api/enhanced-salary", enhancedSalaryRoutes); // Enhanced salary with live attendance and WFH tracking
app.use('/api/consent', consentRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/ems', emsRoutes); // EMS automation routes
app.use('/api/ems-signals', require('./routes/emsSignals')); // EMS real-time signal collection (mouse, keystroke, idle tracking)
app.use('/api/procurement', procurementRoutes); // Procurement routes
app.use('/api/chatbot', chatbotRoutes); // Admin chatbot routes
app.use('/api/biometric', biometricAttendanceRoutes); // Biometric attendance and salary management routes
app.use('/api/hourly-salary', hourlyBasedSalaryRoutes); // Hourly-based salary management routes
app.use('/api/new-salary', newSalaryRoutes); // New salary management system
app.use('/api/branches', branchRoutes); // Branch management routes
app.use('/api/projects', projectRoutes); // Project management routes
app.use('/api/tester', testerRoutes); // Tester routes
app.use('/api/tantra', tantraExecutionRoutes); // Deterministic execution participation
app.use('/api/integration', require('./routes/integrationHealth')); // TANTRA ecosystem integration health
app.use('/api/tasks/ingest', taskIngestionRoutes); // Automated engineering task ingestion pipeline
app.use('/api/setu/convergence', setuConvergenceRoutes); // SETU EOS Constitutional Convergence Core
app.use('/api/group2/context', group2ContextRoutes); // Group 2 Science Context & SANSKAR layer
app.use('/api/knowledge', knowledgeAdminRoutes); // Knowledge Administration

// app.use('/api/new/ai',aiRoutePy)



// Auto-end day background job - DISABLED
// Work days now continue indefinitely until user manually ends them
// const Attendance = require('./models/Attendance');
// const DailyAttendance = require('./models/DailyAttendance');

// const autoEndDayJob = async () => {
//   try {
//     const AUTO_END_DAY_ENABLED = process.env.AUTO_END_DAY_ENABLED === 'true';
//     const MAX_WORKING_HOURS = parseInt(process.env.MAX_WORKING_HOURS) || 8;

//     if (!AUTO_END_DAY_ENABLED) return;

//     const today = new Date();
//     today.setHours(0, 0, 0, 0);

//     // Find all attendance records that started today but haven't ended
//     const activeAttendance = await Attendance.find({
//       date: today,
//       startDayTime: { $exists: true },
//       endDayTime: { $exists: false }
//     }).populate('user', 'name email');

//     const currentTime = new Date();

//     for (const record of activeAttendance) {
//       const hoursWorked = (currentTime - record.startDayTime) / (1000 * 60 * 60);

//       if (hoursWorked >= MAX_WORKING_HOURS) {
//         // Auto end the day
//         record.endDayTime = currentTime;
//         record.employeeNotes = `Auto-ended after ${MAX_WORKING_HOURS} hours of work`;
//         record.autoEnded = true;

//         // Calculate hours worked
//         const startTime = new Date(record.startDayTime);
//         const endTime = currentTime;
//         const timeDiff = endTime - startTime;
//         const calculatedHours = Math.round((timeDiff / (1000 * 60 * 60)) * 100) / 100;
//         record.hoursWorked = calculatedHours;

//         await record.save();

//         // Also update DailyAttendance for permanent storage
//         await DailyAttendance.findOneAndUpdate(
//           { user: record.user._id, date: today },
//           {
//             $set: {
//               endDayTime: currentTime,
//               hoursWorked: calculatedHours,
//               status: 'present',
//               autoEnded: true,
//               employeeNotes: `Auto-ended after ${MAX_WORKING_HOURS} hours of work`
//             }
//           },
//           { upsert: true, new: true }
//         );

//         console.log(`✅ Auto-ended day for user: ${record.user.name} after ${calculatedHours} hours`);

//         // Emit socket event
//         io.emit('attendance:auto-day-ended', {
//           userId: record.user._id,
//           userName: record.user.name,
//           endTime: currentTime,
//           hoursWorked: calculatedHours,
//           reason: 'Exceeded maximum working hours'
//         });
//       }
//     }
//   } catch (error) {
//     console.error('❌ Auto end day job error:', error);
//   }
// };

// Run auto-end day job every 30 minutes - DISABLED
// setInterval(autoEndDayJob, 30 * 60 * 1000);

// Run on server start to catch any that should have already ended - DISABLED
// autoEndDayJob();

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Global error handler caught error:');
  console.error('Error message:', err.message);
  console.error('Error stack:', err.stack);
  console.error('Request URL:', req.url);
  console.error('Request method:', req.method);

  res.status(err.status || 500).json({
    error: "Something went wrong!",
    details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    path: req.url
  });
});

// Midnight auto-end scheduler removed. Work sessions continue indefinitely until user manually ends day.

// Start server
const PORT = process.env.PORT || 5000;

// Connect to MongoDB and start server
async function startServer() {
  try {
    // Connect to MongoDB first with optimized connection pool settings
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 50,           // Maximum number of connections in the pool
      minPoolSize: 10,           // Minimum number of connections to maintain
      maxIdleTimeMS: 30000,      // Close idle connections after 30 seconds
      serverSelectionTimeoutMS: 5000,  // Timeout for selecting a server
      socketTimeoutMS: 45000,    // Socket timeout
      connectTimeoutMS: 10000,   // Connection timeout
      retryWrites: true,         // Retry failed writes
      retryReads: true,          // Retry failed reads
      compressors: ['zlib'],     // Enable compression for network traffic
    });
    console.log("✅ Connected to MongoDB with optimized connection pool (10-50 connections)");

    // Initialize EMS email templates after MongoDB is connected
    const emsAutomation = require('./services/emsAutomation');
    if (!emsAutomation.templatesInitialized) {
      await emsAutomation.initializeDefaultTemplates();
      emsAutomation.templatesInitialized = true;
      console.log('📧 EMS email templates initialized');
    }

    // Start HTTP server
    server.listen(PORT, async () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log('🕛 Midnight Auto-End: DISABLED (Sessions continue across midnight until user manually ends day)');

      // Start attendance persistence cron job
      console.log('🕐 Starting attendance persistence cron job (runs daily at 11:59 PM)...');
      startAttendancePersistenceCron();

      // Start TRINETRA automated alert sweep (additive; reads monitoring data only)
      startTrinetraScheduler();

      // ✅ FIX: Disabled automatic sync on startup to prevent blocking DB on cold starts
      // Sync existing attendance data for the last 30 days
      // console.log('📊 Syncing historical attendance data for the last 30 days...');
      // await syncExistingAttendance();
      console.log('⚠️ Historical attendance sync disabled on startup for performance.');
      console.log('💡 To manually sync, use: POST /api/admin/sync-attendance');
      console.log('✅ Server initialization complete');
    });
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    console.warn("⚠️ BYPASSING MONGODB CRASH TO KEEP ROUTES ALIVE FOR EOD DEMO.");

    // 🔥 Start HTTP server as fallback for Group 2 Routes out-of-band!
    server.listen(PORT, async () => {
      console.log(`🚀 Server forcefully running on port ${PORT} without DB!`);
    });
  }
}

// Process-level resilience guards so transient third-party promise leaks (e.g. headless display probes or DB reconnects)
// are logged cleanly instead of taking down the HTTP server
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled Promise Rejection (non-fatal):', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception:', err?.stack || err);
});

// Start the server
startServer();