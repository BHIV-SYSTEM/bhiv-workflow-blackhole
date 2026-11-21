/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Navigation Structure & Information Architecture
 */

export const ADMIN_NAV_SECTIONS = [
  {
    title: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard', path: '/monitoring-v2/admin/dashboard' },
      { id: 'live-team', label: 'Live Team', icon: 'Users', path: '/monitoring-v2/admin/live-team', badge: 'Live' },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { id: 'daily-monthly', label: 'Daily & Monthly', icon: 'TrendingUp', path: '/monitoring-v2/admin/daily-monthly' },
      { id: 'employee-activity', label: 'Employee Activity', icon: 'UserCheck', path: '/monitoring-v2/admin/employee-activity' },
      { id: 'reports', label: 'Reports', icon: 'FileSpreadsheet', path: '/monitoring-v2/admin/reports' },
      { id: 'ai-insights', label: 'AI Insights', icon: 'Sparkles', path: '/monitoring-v2/admin/ai-insights', badge: 'TRINETRA' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { id: 'alerts', label: 'Alerts', icon: 'BellRing', path: '/monitoring-v2/admin/alerts' },
      { id: 'agent-health', label: 'Agent & Device Health', icon: 'Cpu', path: '/monitoring-v2/admin/agent-health' },
      { id: 'production-overview', label: 'Production Overview', icon: 'Activity', path: '/monitoring-v2/admin/production-overview' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { id: 'policies', label: 'Monitoring Policies', icon: 'ShieldAlert', path: '/monitoring-v2/admin/policies' },
      { id: 'whitelist', label: 'Whitelist & Categories', icon: 'ListFilter', path: '/monitoring-v2/admin/whitelist' },
      { id: 'bulk-ops', label: 'Bulk Operations', icon: 'Layers', path: '/monitoring-v2/admin/bulk-operations' },
      { id: 'audit-logs', label: 'Audit Logs', icon: 'FileText', path: '/monitoring-v2/admin/audit-logs' },
      { id: 'settings', label: 'Settings', icon: 'Settings', path: '/monitoring-v2/admin/settings' },
    ],
  },
];

export const EMPLOYEE_NAV_ITEMS = [
  { id: 'agent', label: 'Desktop Agent', icon: 'Download', path: '/monitoring-v2/employee/agent' },
  { id: 'work-session', label: 'Work Session', icon: 'Timer', path: '/monitoring-v2/employee/session' },
  { id: 'my-devices', label: 'My Devices', icon: 'Laptop', path: '/monitoring-v2/employee/devices' },
  { id: 'privacy', label: 'Privacy Transparency', icon: 'ShieldCheck', path: '/monitoring-v2/employee/privacy' },
  { id: 'troubleshooting', label: 'Troubleshooting', icon: 'HelpCircle', path: '/monitoring-v2/employee/troubleshooting' },
];
