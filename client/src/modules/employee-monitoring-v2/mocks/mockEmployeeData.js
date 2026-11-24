/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Mock Employee Personal Workspace Data (Phase B Demo State)
 *
 * NOTE: Strictly isolated to the personal employee perspective.
 * Contains ZERO peer data, team productivity rankings, or admin views.
 */

export const MOCK_CURRENT_EMPLOYEE = {
  id: 'emp_101',
  name: 'Aarav Sharma',
  email: 'aarav.sharma@niyantran.internal',
  department: 'Engineering',
  role: 'Senior Backend Engineer',
  avatar: 'AS',
  isPilotUser: true,
};

export const MOCK_EMPLOYEE_SESSION = {
  sessionId: 'sess_v2_demo_98231',
  status: 'ACTIVE', // ACTIVE, PAUSED, IDLE, INACTIVE
  startTime: '09:30 AM',
  totalActiveMinutes: 245,
  totalIdleMinutes: 25,
  currentDeviceMode: 'LAPTOP_PC',
  activeDevice: {
    id: 'dev_win_883a',
    name: 'ThinkPad P14s',
    platform: 'Windows 11 Pro',
    ip: '192.168.1.142',
    agentVersion: '2.0.0-phase-a',
    connected: true,
    lastHeartbeat: '5s ago',
  },
};

export const MOCK_EMPLOYEE_DEVICES = [
  {
    id: 'dev_win_883a',
    name: 'ThinkPad P14s Workstation',
    type: 'laptop_pc',
    platform: 'Windows 11 Pro (x64)',
    lastActive: 'Active Now',
    isCurrent: true,
    hmacVerified: true,
  },
  {
    id: 'dev_mob_551z',
    name: 'OnePlus 11 (Personal BYOD)',
    type: 'phone',
    platform: 'Android 14 (Niyantran Mobile PWA)',
    lastActive: 'Yesterday, 18:20',
    isCurrent: false,
    hmacVerified: true,
  },
];

// Generates 12 representative 5-minute bucket aggregates for today's session
export const MOCK_SESSION_TIMELINE = [
  { time: '09:30', activeSeconds: 290, idleSeconds: 10, keyCount: 412, mouseCount: 88, category: 'DEVELOPMENT' },
  { time: '10:00', activeSeconds: 280, idleSeconds: 20, keyCount: 380, mouseCount: 95, category: 'DEVELOPMENT' },
  { time: '10:30', activeSeconds: 300, idleSeconds: 0, keyCount: 520, mouseCount: 110, category: 'DEVELOPMENT' },
  { time: '11:00', activeSeconds: 240, idleSeconds: 60, keyCount: 210, mouseCount: 45, category: 'COMMUNICATION' },
  { time: '11:30', activeSeconds: 295, idleSeconds: 5, keyCount: 440, mouseCount: 78, category: 'DEVELOPMENT' },
  { time: '12:00', activeSeconds: 270, idleSeconds: 30, keyCount: 310, mouseCount: 65, category: 'DOCUMENTATION' },
  { time: '12:30', activeSeconds: 290, idleSeconds: 10, keyCount: 490, mouseCount: 105, category: 'DEVELOPMENT' },
  { time: '13:00', activeSeconds: 50, idleSeconds: 250, keyCount: 12, mouseCount: 4, category: 'NEUTRAL' }, // Lunch
  { time: '13:30', activeSeconds: 285, idleSeconds: 15, keyCount: 395, mouseCount: 82, category: 'DEVELOPMENT' },
  { time: '14:00', activeSeconds: 295, idleSeconds: 5, keyCount: 460, mouseCount: 91, category: 'DEVELOPMENT' },
];

export const MOCK_TRANSPARENCY_AUDIT = [
  {
    id: 'audit_01',
    timestamp: '14:00:15',
    dataCollected: 'Numeric keystroke count (460), Mouse clicks (91), Category (DEVELOPMENT)',
    dataExcluded: '❌ Keystroke characters, ❌ Screen visuals, ❌ Clipboard text, ❌ Personal URLs',
    status: 'Verified Privacy-Compliant',
  },
  {
    id: 'audit_02',
    timestamp: '13:30:15',
    dataCollected: 'Numeric keystroke count (395), Mouse clicks (82), Category (DEVELOPMENT)',
    dataExcluded: '❌ Keystroke characters, ❌ Screen visuals, ❌ Clipboard text, ❌ Personal URLs',
    status: 'Verified Privacy-Compliant',
  },
  {
    id: 'audit_03',
    timestamp: '13:00:15',
    dataCollected: 'Hardware idle seconds (250s), Category (NEUTRAL)',
    dataExcluded: '❌ Keystroke characters, ❌ Screen visuals, ❌ Clipboard text, ❌ Personal URLs',
    status: 'Verified Privacy-Compliant',
  },
];
