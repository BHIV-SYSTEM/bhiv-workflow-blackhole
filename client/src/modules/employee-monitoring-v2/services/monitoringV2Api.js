/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Client API Client
 *
 * Communicates strictly with isolated /api/monitoring-v2/* endpoints.
 * Never calls or affects /api/monitoring/* (V1 endpoints).
 */

import axios from 'axios';
import { isMonitoringV2Enabled } from '../config/flags.js';

export const getAuthToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
};

const api = axios.create({
  baseURL: '/api/monitoring-v2',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  if (!isMonitoringV2Enabled()) {
    return Promise.reject(new Error('MONITORING_V2_DISABLED: V2 feature flag is disabled'));
  }
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    config.headers['x-auth-token'] = token;
  }
  return config;
});

export const monitoringV2Api = {
  // Device pairing & lifecycle
  generateEnrollmentCode: () => api.post('/devices/enrollment-code'),
  pairDevice: (payload) => api.post('/devices/pair', payload),
  registerDevice: (payload) => api.post('/devices/register', payload),
  listDevices: (params) => api.get('/devices', { params }),
  revokeDevice: (deviceId, payload) => api.post(`/devices/${deviceId}/revoke`, payload),

  // Session lifecycle
  startSession: (payload) => api.post('/sessions/start', payload),
  pauseSession: (sessionId, payload) => api.post(`/sessions/${sessionId}/pause`, payload),
  resumeSession: (sessionId) => api.post(`/sessions/${sessionId}/resume`),
  endSession: (sessionId, payload) => api.post(`/sessions/${sessionId}/end`, payload),
  getCurrentSession: () => api.get('/sessions/current'),
  getSessionStatus: () => api.get('/sessions/current'),
  renewLease: (sessionId, deviceId) => api.post(`/sessions/${sessionId}/renew-lease`, { deviceId }, {
    headers: { 'x-device-id': deviceId }
  }),
  initiateHandoff: (sessionId, payload) => api.post(`/sessions/${sessionId}/handoff`, payload),

  // Installer & Distribution
  getInstallerInfo: () => api.get('/installer/info'),
  getInstallerDownloadUrl: () => '/api/monitoring-v2/installer/download',

  // Telemetry & Reporting
  getAggregatedActivity: (params) => api.get('/telemetry/aggregated', { params }),
  getDailyTimeline: (params) => api.get('/telemetry/timeline', { params }),
  getReports: (params) => api.get('/admin/reports', { params }),

  // Fleet & Admin analytics
  getLiveTeam: () => api.get('/admin/live-team'),
  getTeamSummary: (params) => api.get('/admin/summary', { params }),
  getAuditLogs: (params) => api.get('/admin/audit-logs', { params }),

  // Explainable Activity Alerts Engine (Milestone 2 - F7, F8, F9)
  getAlerts: (params) => {
    const token = getAuthToken();
    return axios.get('/api/alerts', {
      params,
      headers: token ? { Authorization: `Bearer ${token}`, 'x-auth-token': token } : {}
    });
  },
  explainAlert: (alertId, explanation) => {
    const token = getAuthToken();
    return axios.post(`/api/alerts/${alertId}/explain`, { explanation }, {
      headers: token ? { Authorization: `Bearer ${token}`, 'x-auth-token': token } : {}
    });
  },
  resolveAlert: (alertId, verdict, resolution_notes) => {
    const token = getAuthToken();
    return axios.post(`/api/alerts/${alertId}/resolve`, { verdict, resolution_notes }, {
      headers: token ? { Authorization: `Bearer ${token}`, 'x-auth-token': token } : {}
    });
  },
  dismissAlert: (alertId, notes) => {
    const token = getAuthToken();
    return axios.post(`/api/alerts/${alertId}/dismiss`, { notes }, {
      headers: token ? { Authorization: `Bearer ${token}`, 'x-auth-token': token } : {}
    });
  },
};

export default monitoringV2Api;
