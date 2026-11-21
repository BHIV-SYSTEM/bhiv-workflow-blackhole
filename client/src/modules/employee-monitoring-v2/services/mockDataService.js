/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Mock Data Service (Neutralized / Production Zero-State)
 *
 * All synthetic mock data and hardcoded metrics have been purged in compliance with Milestone 4 (F14).
 * Real applications must consume live endpoints via monitoringV2Api.
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

let currentSessionState = { ...MOCK_EMPLOYEE_SESSION };
let alertsState = [...MOCK_ALERTS];
let devicesState = [...MOCK_EMPLOYEE_DEVICES];

export const MockDataService = {
  // Fleet & Admin methods
  getSummaryStats: () => ({ ...MOCK_SUMMARY_STATS }),

  getLiveTeam: () => [],

  getEmployeeById: () => null,

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
      activeDevice: null,
    };
    return { ...currentSessionState };
  },

  getPersonalDevices: () => [...devicesState],
  getPersonalTimeline: () => [...MOCK_SESSION_TIMELINE],
  getPersonalTransparencyAudit: () => [...MOCK_TRANSPARENCY_AUDIT],
};

export default MockDataService;
