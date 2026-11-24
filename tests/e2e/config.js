/**
 * Niyantran Employee Monitoring V2 — E2E Test Suite Configuration
 * Centralized settings for service endpoints, credentials, hardware specs, and timeouts.
 */

const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const SERVER_DIR = path.resolve(ROOT_DIR, 'server');
const CLIENT_DIR = path.resolve(ROOT_DIR, 'client');
const AGENT_DIR = path.resolve(ROOT_DIR, 'employee-agent-v2');
const REPORTS_DIR = path.resolve(__dirname, 'reports');

const config = {
  // Service Endpoints
  backendUrl: process.env.TEST_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:5000',
  frontendUrl: process.env.TEST_FRONTEND_URL || process.env.FRONTEND_URL || 'http://localhost:5173',
  loopbackUrl: process.env.TEST_LOOPBACK_URL || process.env.LOOPBACK_URL || 'http://127.0.0.1:48120',
  mongoUri: process.env.TEST_MONGODB_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/niyantran',

  // Service Ports
  ports: {
    backend: 5000,
    frontend: 5173,
    loopback: 48120,
    mongodb: 27017
  },

  // Test User Accounts & Credentials
  credentials: {
    admin: {
      email: 'rudra@blackhole.ai',
      password: 'Password123!',
      name: 'Rudra (Project Lead)',
      role: 'Admin',
      department: 'Technology',
      branch: 'blackhole_mumbai'
    },
    user: {
      email: 'ishan@blackhole.ai',
      password: 'Password123!',
      name: 'Ishan (Team Member)',
      role: 'User',
      department: 'Technology',
      branch: 'blackhole_mumbai'
    },
    leadAdmin: {
      email: 'lead.admin@blackhole.ai',
      password: 'Password123!',
      name: 'Project Lead / Admin',
      role: 'Admin',
      department: 'Management',
      branch: 'blackhole_mumbai'
    },
    testEmployee: {
      email: 'niyantran.e2e.test@localhost.invalid',
      password: 'TestPassword!98765',
      name: 'Niyantran E2E Test Employee',
      role: 'User',
      department: 'Engineering',
      branch: 'blackhole_mumbai'
    }
  },

  // JWT Security Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'niyantran-prod-jwt-7f3a9c2e8b1d4g6h0k5m8p2q9s3v6x1z',
    expiresIn: '180d'
  },

  // Acer Laptop Hardware Specifications (from WMI / CIM queries)
  hardware: {
    manufacturer: 'Acer',
    model: 'Nitro AN515-57',
    uuid: 'E77CA225-2515-EC11-80E1-088FC3199D36',
    identifyingNumber: 'NHQESAA00113717DEA3400',
    platform: 'win32'
  },

  // Desktop Agent Installer Metadata
  installer: {
    version: '2.0.0',
    fileName: 'NiyantranMonitoringAgentV2-Setup.exe',
    sha256: 'B104D7D88C13A29074D7A01368705B90F23CDB07A6F459FE98E67315E4916003',
    sha256Lower: 'b104d7d88c13a29074d7a01368705b90f23cdb07a6f459fe98e67315e4916003',
    sizeBytes: 55808,
    localPath: path.resolve(AGENT_DIR, 'dist', 'NiyantranMonitoringAgentV2-Setup.exe')
  },

  // Timeouts & Durations (in milliseconds unless specified)
  timeouts: {
    defaultTimeout: 10000,
    longTimeout: 30000,
    shortTimeout: 3000,
    socketTimeout: 5000,
    preflightProbeTimeout: 2000,
    leaseSeconds: 60,
    graceSeconds: 30,
    maxAutonomousSeconds: 90,
    maxOfflineBufferMinutes: 120
  },

  // Feature Flags required for V2 Subsystem
  featureFlags: {
    ENABLE_MONITORING_V2: 'true',
    ENABLE_MONITORING_V2_AGENT: 'true',
    ENABLE_MONITORING_V2_INGESTION: 'true',
    ENABLE_MONITORING_V2_ADMIN_UI: 'true',
    ENABLE_MONITORING_V2_EMPLOYEE_UI: 'true'
  },

  // Canonical Subsystem Directory Paths
  paths: {
    root: ROOT_DIR,
    server: SERVER_DIR,
    client: CLIENT_DIR,
    agent: AGENT_DIR,
    reports: REPORTS_DIR
  },

  // Feature Inventory (F1 - F16)
  features: {
    F1: 'Desktop Agent Installer & SHA-256',
    F2: 'Open Agent & Mini-Window Launcher',
    F3: 'Native Windows Tray & Lifecycle',
    F4: 'Acer Device Detection',
    F5: 'Agent Privacy Enforcement',
    F6: 'Auto-Reconnection & Offline Buffer',
    F7: 'Legacy Surveillance Stripping',
    F8: 'Deterministic Explainable Alert Engine',
    F9: 'Alert Explanation & Review Workflow',
    F10: 'Workday & Attendance Synchronization',
    F11: 'Decoupled Attendance & Disconnected State',
    F12: 'Workday State Synchronization',
    F13: 'End Day Finalization & Daily Report',
    F14: 'Mock Data Eradication',
    F15: 'Real-Time Module Integration & Socket.io',
    F16: 'Daily Reports Export & Analytics'
  }
};

module.exports = config;
