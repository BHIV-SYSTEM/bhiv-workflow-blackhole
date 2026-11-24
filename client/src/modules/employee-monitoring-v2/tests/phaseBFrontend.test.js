/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Phase B Frontend Isolation, Navigation & Mock Verification Tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target modules
import { ADMIN_NAV_SECTIONS, EMPLOYEE_NAV_ITEMS } from '../config/navigation.js';
import { UI_FEATURE_FLAGS } from '../config/flags.js';
import MockDataService from '../services/mockDataService.js';
import {
  MOCK_SUMMARY_STATS,
  MOCK_LIVE_TEAM,
  MOCK_ALERTS,
  MOCK_DEVICES,
} from '../mocks/mockFleetData.js';
import {
  MOCK_CURRENT_EMPLOYEE,
  MOCK_EMPLOYEE_SESSION,
  MOCK_SESSION_TIMELINE,
} from '../mocks/mockEmployeeData.js';
import { MOCK_TRINETRA_INSIGHTS } from '../mocks/mockTrinetraInsights.js';

// ----------------------------------------------------------------------------
// TEST SUITE 1: Navigation Architecture & Information Hierarchy
// ----------------------------------------------------------------------------

test('Navigation: Admin sections match the 4 approved categories', () => {
  const sectionTitles = ADMIN_NAV_SECTIONS.map((s) => s.title);
  assert.deepEqual(sectionTitles, ['Overview', 'Analytics', 'Operations', 'Administration']);
});

test('Navigation: Admin Console has all proposed views without legacy clutter', () => {
  const allItemIds = ADMIN_NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.id));
  const expectedIds = [
    'dashboard', 'live-team',
    'daily-monthly', 'employee-activity', 'reports', 'ai-insights',
    'alerts', 'agent-health', 'production-overview',
    'policies', 'whitelist', 'bulk-ops', 'audit-logs', 'settings',
  ];

  for (const expected of expectedIds) {
    assert.ok(allItemIds.includes(expected), `Missing proposed navigation item: ${expected}`);
  }
});

test('Navigation: Employee Workspace contains only employee-safe views', () => {
  const employeeItemIds = EMPLOYEE_NAV_ITEMS.map((i) => i.id);
  assert.deepEqual(employeeItemIds, ['work-session', 'my-devices', 'privacy', 'troubleshooting']);

  // Invariant: Employee navigation must never expose admin items
  const forbiddenAdminItems = ['dashboard', 'live-team', 'reports', 'policies', 'bulk-ops', 'audit-logs'];
  for (const item of employeeItemIds) {
    assert.ok(!forbiddenAdminItems.includes(item));
  }
});

// ----------------------------------------------------------------------------
// TEST SUITE 2: Mock Data Privacy & Anti-Surveillance Gate
// ----------------------------------------------------------------------------

test('Mocks: Live team telemetry contains zero keystroke text or screenshot fields', () => {
  const forbiddenFields = ['keystrokes', 'text', 'screenshot', 'image', 'clipboard', 'url', 'password'];
  for (const member of MOCK_LIVE_TEAM) {
    for (const field of forbiddenFields) {
      assert.equal(member[field], undefined, `Forbidden surveillance field '${field}' found in mock team data`);
    }
  }
});

test('Mocks: Employee session timeline contains numeric aggregates only', () => {
  for (const bucket of MOCK_SESSION_TIMELINE) {
    assert.equal(typeof bucket.activeSeconds, 'number');
    assert.equal(typeof bucket.idleSeconds, 'number');
    assert.equal(typeof bucket.keyCount, 'number');
    assert.equal(typeof bucket.mouseCount, 'number');
    assert.equal(bucket.text, undefined);
    assert.equal(bucket.screenshot, undefined);
    assert.equal(bucket.clipboard, undefined);
  }
});

test('Mocks: TRINETRA AI representation is non-invasive without OCR/screen scraping', () => {
  for (const insight of MOCK_TRINETRA_INSIGHTS) {
    assert.ok(insight.privacyNote.includes('Evaluated purely from 60s input frequency') ||
              insight.privacyNote.includes('timestamps without inspecting work content') ||
              insight.privacyNote.includes('ConflictDetector'));
  }
});

// ----------------------------------------------------------------------------
// TEST SUITE 3: Interactive Filter & Search Functionality
// ----------------------------------------------------------------------------

test('MockDataService: getLiveTeam filters accurately by department', () => {
  const engTeam = MockDataService.getLiveTeam({ department: 'Engineering' });
  assert.ok(engTeam.length > 0);
  for (const m of engTeam) {
    assert.equal(m.department, 'Engineering');
  }

  const prodTeam = MockDataService.getLiveTeam({ department: 'Product' });
  assert.ok(prodTeam.length > 0);
  for (const m of prodTeam) {
    assert.equal(m.department, 'Product');
  }
});

test('MockDataService: getLiveTeam filters accurately by search query', () => {
  const searchAarav = MockDataService.getLiveTeam({ search: 'Aarav' });
  assert.equal(searchAarav.length, 1);
  assert.equal(searchAarav[0].name, 'Aarav Sharma');

  const searchFigma = MockDataService.getLiveTeam({ search: 'Figma' });
  assert.equal(searchFigma.length, 1);
  assert.equal(searchFigma[0].name, 'Ananya Deshmukh');
});

test('MockDataService: getLiveTeam filters accurately by session status', () => {
  const conflictMembers = MockDataService.getLiveTeam({ sessionStatus: 'V1_AGENT_CONFLICT' });
  assert.equal(conflictMembers.length, 1);
  assert.equal(conflictMembers[0].name, 'Vikram Joshi');

  const idleMembers = MockDataService.getLiveTeam({ sessionStatus: 'IDLE' });
  assert.equal(idleMembers.length, 1);
  assert.equal(idleMembers[0].name, 'Rohan Verma');
});

// ----------------------------------------------------------------------------
// TEST SUITE 4: Interactive State Machine & Device Switcher
// ----------------------------------------------------------------------------

test('MockDataService: session state transitions (start, pause, resume, end)', () => {
  // Start
  const started = MockDataService.startWorkSession('LAPTOP_PC');
  assert.equal(started.status, 'ACTIVE');
  assert.equal(started.currentDeviceMode, 'LAPTOP_PC');

  // Pause
  const paused = MockDataService.pauseWorkSession('Lunch Break');
  assert.equal(paused.status, 'PAUSED');
  assert.equal(paused.pauseReason, 'Lunch Break');

  // Resume
  const resumed = MockDataService.resumeWorkSession();
  assert.equal(resumed.status, 'ACTIVE');
  assert.equal(resumed.pauseReason, null);

  // End
  const ended = MockDataService.endWorkSession();
  assert.equal(ended.status, 'INACTIVE');
});

test('MockDataService: switchDevice updates mode to PHONE and LAPTOP_PC', () => {
  const phoneSwitched = MockDataService.switchDevice('PHONE');
  assert.equal(phoneSwitched.currentDeviceMode, 'PHONE');
  assert.ok(phoneSwitched.activeDevice.name.includes('OnePlus') || phoneSwitched.activeDevice.name.includes('Mobile'));

  const pcSwitched = MockDataService.switchDevice('LAPTOP_PC');
  assert.equal(pcSwitched.currentDeviceMode, 'LAPTOP_PC');
  assert.ok(pcSwitched.activeDevice.name.includes('ThinkPad') || pcSwitched.activeDevice.name.includes('Workstation'));
});

// ----------------------------------------------------------------------------
// TEST SUITE 5: Zero Attendance Mutation & V1 Isolation
// ----------------------------------------------------------------------------

test('Isolation: Frontend services never contain attendance mutation calls', () => {
  const serviceFiles = [
    path.resolve(__dirname, '../services/mockDataService.js'),
    path.resolve(__dirname, '../services/monitoringV2Api.js'),
  ];

  const forbiddenCalls = ['clockin', 'clockout', 'punchin', 'punchout', 'deductsalary', 'updateshift'];
  for (const file of serviceFiles) {
    const code = fs.readFileSync(file, 'utf8').toLowerCase();
    for (const forbidden of forbiddenCalls) {
      assert.ok(
        !code.includes(forbidden),
        `Frontend service ${path.basename(file)} illegally contains attendance mutation call: ${forbidden}`
      );
    }
  }
});

test('Isolation: Client API never calls legacy /api/monitoring endpoints', () => {
  const apiFile = path.resolve(__dirname, '../services/monitoringV2Api.js');
  const code = fs.readFileSync(apiFile, 'utf8');

  assert.ok(code.includes("baseURL: '/api/monitoring-v2'"));
  // Invariant: no calls to unversioned /api/monitoring/
  assert.ok(!code.includes("'/api/monitoring/'"));
  assert.ok(!code.includes('"api/monitoring/"'));
});

// ----------------------------------------------------------------------------
// TEST SUITE 6: Component File Syntax & Existence
// ----------------------------------------------------------------------------

test('Component Existence: all 14 admin pages and 4 employee pages exist and are non-empty', () => {
  const expectedPages = [
    // Admin
    '../admin/pages/AdminDashboardPage.jsx',
    '../admin/pages/LiveTeamPage.jsx',
    '../admin/pages/DailyMonthlyPage.jsx',
    '../admin/pages/EmployeeActivityPage.jsx',
    '../admin/pages/ReportsPage.jsx',
    '../admin/pages/TrinetraAiPage.jsx',
    '../admin/pages/AlertsPage.jsx',
    '../admin/pages/AgentHealthPage.jsx',
    '../admin/pages/ProductionOverviewPage.jsx',
    '../admin/pages/PoliciesPage.jsx',
    '../admin/pages/WhitelistPage.jsx',
    '../admin/pages/BulkOperationsPage.jsx',
    '../admin/pages/AuditLogsPage.jsx',
    '../admin/pages/SettingsPage.jsx',
    // Employee
    '../employee/pages/WorkSessionPage.jsx',
    '../employee/pages/DeviceManagementPage.jsx',
    '../employee/pages/PrivacyTransparencyPage.jsx',
    '../employee/pages/TroubleshootingPage.jsx',
  ];

  for (const pageRel of expectedPages) {
    const fullPath = path.resolve(__dirname, pageRel);
    assert.ok(fs.existsSync(fullPath), `Page file does not exist: ${pageRel}`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 200, `Page file appears empty or incomplete: ${pageRel}`);
  }
});
