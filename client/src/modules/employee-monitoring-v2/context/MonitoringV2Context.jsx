/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * React Context Provider (Phase B Interactive State)
 *
 * Provides isolated state management for Employee Monitoring V2 UI demo.
 * Does not interact with legacy MonitoringContext or V1 monitoring services.
 */

import React, { createContext, useContext, useState } from 'react';
import { UI_FEATURE_FLAGS } from '../config/flags.js';
import { SESSION_STATES } from '../config/constants.js';
import MockDataService from '../services/mockDataService.js';

const MonitoringV2Context = createContext(null);

export const MonitoringV2Provider = ({ children }) => {
  const [isEnabled] = useState(true); // Enabled for local Phase B frontend demo
  const [simulatedRole, setSimulatedRole] = useState('Admin'); // Admin or Employee
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isDeviceSwitcherOpen, setIsDeviceSwitcherOpen] = useState(false);

  // Employee personal session state
  const [employeeSession, setEmployeeSession] = useState(MockDataService.getEmployeeSession());
  const [personalDevices] = useState(MockDataService.getPersonalDevices());
  const [conflictDetected, setConflictDetected] = useState(false);

  // Fleet & Admin filter state
  const [departmentFilter, setDepartmentFilter] = useState('All Departments');
  const [searchQuery, setSearchQuery] = useState('');
  const [sessionStatusFilter, setSessionStatusFilter] = useState('ALL');
  const [lastRefreshed, setLastRefreshed] = useState(new Date().toLocaleTimeString());

  // Interactive session controls
  const handleStartSession = (mode = 'LAPTOP_PC') => {
    const updated = MockDataService.startWorkSession(mode);
    setEmployeeSession(updated);
  };

  const handlePauseSession = (reason = 'Break') => {
    const updated = MockDataService.pauseWorkSession(reason);
    setEmployeeSession(updated);
  };

  const handleResumeSession = () => {
    const updated = MockDataService.resumeWorkSession();
    setEmployeeSession(updated);
  };

  const handleEndSession = () => {
    const updated = MockDataService.endWorkSession();
    setEmployeeSession(updated);
  };

  const handleSwitchDevice = (targetMode) => {
    const updated = MockDataService.switchDevice(targetMode);
    setEmployeeSession(updated);
  };

  const handleRefreshTelemetry = () => {
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
    personalDevices,
    conflictDetected,
    setConflictDetected,
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
