/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Stateful Mock Data Service (Phase B)
 *
 * Provides responsive, realistic mock data for all UI pages.
 * Simulates real user interactions (filters, search, pause, resume, handoff)
 * entirely in client memory without backend mutations.
 */

import {
  MOCK_SUMMARY_STATS,
  MOCK_LIVE_TEAM,
  MOCK_DAILY_TRENDS,
  MOCK_CATEGORY_BREAKDOWN,
  MOCK_ALERTS,
  MOCK_DEVICES,
  MOCK_AUDIT_LOGS,
} from '../mocks/mockFleetData.js';

import {
  MOCK_CURRENT_EMPLOYEE,
  MOCK_EMPLOYEE_SESSION,
  MOCK_EMPLOYEE_DEVICES,
  MOCK_SESSION_TIMELINE,
  MOCK_TRANSPARENCY_AUDIT,
} from '../mocks/mockEmployeeData.js';

import { MOCK_TRINETRA_INSIGHTS } from '../mocks/mockTrinetraInsights.js';

// In-memory state for interactive session demo
let currentSessionState = { ...MOCK_EMPLOYEE_SESSION };
let alertsState = [...MOCK_ALERTS];
let devicesState = [...MOCK_EMPLOYEE_DEVICES];

export const MockDataService = {
  // Fleet & Admin methods
  getSummaryStats: () => ({ ...MOCK_SUMMARY_STATS }),

  getLiveTeam: ({ department = 'All Departments', search = '', sessionStatus = 'ALL' } = {}) => {
    let list = [...MOCK_LIVE_TEAM];

    if (department && department !== 'All Departments') {
      list = list.filter((m) => m.department.toLowerCase() === department.toLowerCase());
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.role.toLowerCase().includes(q) ||
          m.department.toLowerCase().includes(q) ||
          m.focusedApp.toLowerCase().includes(q)
      );
    }

    if (sessionStatus && sessionStatus !== 'ALL') {
      list = list.filter((m) => m.sessionStatus.toUpperCase() === sessionStatus.toUpperCase());
    }

    return list;
  },

  getEmployeeById: (id) => {
    return MOCK_LIVE_TEAM.find((m) => m.id === id) || null;
  },

  getDailyTrends: () => [...MOCK_DAILY_TRENDS],
  getCategoryBreakdown: () => [...MOCK_CATEGORY_BREAKDOWN],
  getAlerts: () => [...alertsState],

  dismissAlert: (id) => {
    alertsState = alertsState.filter((a) => a.id !== id);
    return alertsState;
  },

  getDevices: () => [...MOCK_DEVICES],
  getAuditLogs: () => [...MOCK_AUDIT_LOGS],
  getTrinetraInsights: () => [...MOCK_TRINETRA_INSIGHTS],

  // Employee Workspace methods
  getCurrentEmployee: () => ({ ...MOCK_CURRENT_EMPLOYEE }),
  getEmployeeSession: () => ({ ...currentSessionState }),

  startWorkSession: (mode = 'LAPTOP_PC') => {
    currentSessionState = {
      ...currentSessionState,
      status: 'ACTIVE',
      startTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      currentDeviceMode: mode,
    };
    return { ...currentSessionState };
  },

  pauseWorkSession: (reason = 'Break') => {
    currentSessionState = {
      ...currentSessionState,
      status: 'PAUSED',
      pauseReason: reason,
    };
    return { ...currentSessionState };
  },

  resumeWorkSession: () => {
    currentSessionState = {
      ...currentSessionState,
      status: 'ACTIVE',
      pauseReason: null,
    };
    return { ...currentSessionState };
  },

  endWorkSession: () => {
    currentSessionState = {
      ...currentSessionState,
      status: 'INACTIVE',
    };
    return { ...currentSessionState };
  },

  switchDevice: (targetMode) => {
    currentSessionState = {
      ...currentSessionState,
      currentDeviceMode: targetMode,
      activeDevice: {
        ...currentSessionState.activeDevice,
        name: targetMode === 'PHONE' ? 'OnePlus 11 (Mobile PWA)' : 'ThinkPad P14s (Workstation)',
        platform: targetMode === 'PHONE' ? 'Android 14' : 'Windows 11 Pro',
      },
    };
    return { ...currentSessionState };
  },

  getPersonalDevices: () => [...devicesState],
  getPersonalTimeline: () => [...MOCK_SESSION_TIMELINE],
  getPersonalTransparencyAudit: () => [...MOCK_TRANSPARENCY_AUDIT],
};

export default MockDataService;
