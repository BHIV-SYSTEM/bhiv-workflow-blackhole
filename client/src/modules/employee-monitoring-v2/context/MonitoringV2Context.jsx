/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * React Context Provider (Integrated Real Backend + Offline/Demo Fallback)
 *
 * Provides state management for Employee Monitoring V2 UI:
 * - Real API integration with /api/monitoring-v2/*
 * - Automatic session state sync with backend
 * - Seamless fallback for isolated UI testing and mock demos
 * - Strict isolation from legacy V1 monitoring services
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UI_FEATURE_FLAGS } from '../config/flags.js';
import MockDataService from '../services/mockDataService.js';
import monitoringV2Api from '../services/monitoringV2Api.js';

const MonitoringV2Context = createContext(null);

export const MonitoringV2Provider = ({ children }) => {
  const [isEnabled] = useState(true);
  const [simulatedRole, setSimulatedRole] = useState('Admin'); // Admin or Employee
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isDeviceSwitcherOpen, setIsDeviceSwitcherOpen] = useState(false);

  // Employee personal session state
  const [employeeSession, setEmployeeSession] = useState(MockDataService.getEmployeeSession());
  const [personalDevices, setPersonalDevices] = useState(MockDataService.getPersonalDevices());
  const [conflictDetected, setConflictDetected] = useState(false);
  const [isBackendConnected, setIsBackendConnected] = useState(false);

  // Fleet & Admin filter state
  const [departmentFilter, setDepartmentFilter] = useState('All Departments');
  const [searchQuery, setSearchQuery] = useState('');
  const [sessionStatusFilter, setSessionStatusFilter] = useState('ALL');
  const [lastRefreshed, setLastRefreshed] = useState(new Date().toLocaleTimeString());

  // Sync session state from real backend on mount
  const syncSessionWithBackend = useCallback(async () => {
    try {
      const response = await monitoringV2Api.getCurrentSession();
      if (response?.data?.session) {
        const s = response.data.session;
        setIsBackendConnected(true);
        setEmployeeSession((prev) => ({
          ...prev,
          sessionId: s.session_id,
          status: s.state,
          currentDeviceMode: s.mode || 'LAPTOP_PC',
          totalActiveMinutes: Math.round((s.accumulated_seconds?.active || 0) / 60),
          startTime: s.started_at ? new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : prev.startTime,
          activeDevice: {
            id: s.active_device || prev.activeDevice?.id || 'DEV-ACTIVE',
            name: s.active_device ? `Device (${s.active_device})` : prev.activeDevice?.name || 'Primary Workstation',
          },
          pauseReason: s.state === 'PAUSED' ? 'Paused' : null,
          leaseExpiresAt: s.lease_expires_at,
        }));
      } else {
        setIsBackendConnected(true);
      }
    } catch {
      // Backend unavailable or user not logged in; retain demo state
      setIsBackendConnected(false);
    }
  }, []);

  useEffect(() => {
    syncSessionWithBackend();
  }, [syncSessionWithBackend]);

  // Interactive session controls with real backend API calls + fallback
  const handleStartSession = async (mode = 'LAPTOP_PC', deviceId = null) => {
    try {
      const resolvedDeviceId = deviceId || employeeSession.activeDevice?.id || 'DEV-DEFAULT-PC';
      const response = await monitoringV2Api.startSession({
        mode,
        deviceId: mode === 'LAPTOP_PC' ? resolvedDeviceId : null,
      });

      if (response?.data?.sessionId) {
        setEmployeeSession((prev) => ({
          ...prev,
          sessionId: response.data.sessionId,
          status: response.data.state || 'ACTIVE',
          currentDeviceMode: response.data.mode || mode,
          startTime: new Date(response.data.startedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          leaseExpiresAt: response.data.leaseExpiresAt,
          pauseReason: null,
        }));
        return response.data;
      }
    } catch {
      // Fallback to local mock state
    }

    const updated = MockDataService.startWorkSession(mode);
    setEmployeeSession(updated);
    return updated;
  };

  const handlePauseSession = async (reason = 'Break') => {
    if (employeeSession.sessionId) {
      try {
        await monitoringV2Api.pauseSession(employeeSession.sessionId, { reason });
      } catch {
        // Fallback to local pause
      }
    }
    const updated = MockDataService.pauseWorkSession(reason);
    setEmployeeSession(updated);
  };

  const handleResumeSession = async () => {
    if (employeeSession.sessionId) {
      try {
        await monitoringV2Api.resumeSession(employeeSession.sessionId);
      } catch {
        // Fallback to local resume
      }
    }
    const updated = MockDataService.resumeWorkSession();
    setEmployeeSession(updated);
  };

  const handleEndSession = async () => {
    if (employeeSession.sessionId) {
      try {
        await monitoringV2Api.endSession(employeeSession.sessionId);
      } catch {
        // Fallback to local end
      }
    }
    const updated = MockDataService.endWorkSession();
    setEmployeeSession(updated);
  };

  const handleSwitchDevice = async (targetMode, targetDeviceId = null) => {
    if (employeeSession.sessionId) {
      try {
        await monitoringV2Api.initiateHandoff(employeeSession.sessionId, {
          targetMode,
          targetDeviceId,
          reason: 'Switch initiated from Web Dashboard'
        });
      } catch {
        // Fallback to local switch
      }
    }
    const updated = MockDataService.switchDevice(targetMode);
    setEmployeeSession(updated);
  };

  const handleRefreshTelemetry = () => {
    syncSessionWithBackend();
    setLastRefreshed(new Date().toLocaleTimeString());
  };

  const value = {
    isEnabled,
    flags: UI_FEATURE_FLAGS,
    simulatedRole,
    setSimulatedRole,
    activeTab,
    setActiveTab,
    isDeviceSwitcherOpen,
    setIsDeviceSwitcherOpen,
    employeeSession,
    setEmployeeSession,
    personalDevices,
    setPersonalDevices,
    conflictDetected,
    setConflictDetected,
    isBackendConnected,
    departmentFilter,
    setDepartmentFilter,
    searchQuery,
    setSearchQuery,
    sessionStatusFilter,
    setSessionStatusFilter,
    lastRefreshed,
    handleRefreshTelemetry,
    handleStartSession,
    handlePauseSession,
    handleResumeSession,
    handleEndSession,
    handleSwitchDevice,
  };

  return (
    <MonitoringV2Context.Provider value={value}>
      {children}
    </MonitoringV2Context.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useMonitoringV2Context = () => {
  const context = useContext(MonitoringV2Context);
  if (!context) {
    throw new Error('useMonitoringV2Context must be used within a MonitoringV2Provider');
  }
  return context;
};

export default MonitoringV2Context;
