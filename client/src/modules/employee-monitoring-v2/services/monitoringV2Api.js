/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Client API Client
 *
 * Communicates strictly with isolated /api/monitoring-v2/* endpoints.
 * Never calls or affects /api/monitoring/* (V1 endpoints).
 */

import axios from 'axios';
import { isMonitoringV2Enabled } from '../config/flags.js';

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
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const monitoringV2Api = {
  registerDevice: (payload) => api.post('/devices/register', payload),
  listDevices: () => api.get('/devices'),
  revokeDevice: (deviceId) => api.post(`/devices/${deviceId}/revoke`),
  getSessionStatus: () => api.get('/session/status'),
  initiateHandoff: (targetDeviceId) => api.post('/session/handoff', { targetDeviceId }),
  getAggregatedActivity: (params) => api.get('/telemetry/aggregated', { params }),
  getAuditLogs: (params) => api.get('/admin/audit-logs', { params }),
};

export default monitoringV2Api;
