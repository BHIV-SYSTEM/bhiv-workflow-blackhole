/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Employee Monitoring Workspace Page (Integrated Inside Niyantran DashboardLayout)
 *
 * Minimal, privacy-first interface for employees to manage their work sessions and devices.
 * Zero access to administrative telemetry, team rankings, or peers.
 */

import React, { useState } from 'react';
import { MonitoringV2Provider, useMonitoringV2Context } from '../context/MonitoringV2Context';
import PrivacyShieldBadge from '../components/common/PrivacyShieldBadge';
import DeviceSwitcherModal from '../components/common/DeviceSwitcherModal';
import Badge from '../components/ui/Badge';

// Employee Content Sections
import WorkSessionPage from '../employee/pages/WorkSessionPage';
import DeviceManagementPage from '../employee/pages/DeviceManagementPage';
import PrivacyTransparencyPage from '../employee/pages/PrivacyTransparencyPage';
import TroubleshootingPage from '../employee/pages/TroubleshootingPage';

import {
  Timer,
  Laptop,
  Smartphone,
  ArrowRightLeft,
  ShieldCheck,
  HelpCircle,
  Circle,
} from 'lucide-react';

const EMPLOYEE_LOCAL_TABS = [
  { id: 'session', label: 'Work Session', icon: Timer },
  { id: 'devices', label: 'My Devices', icon: Laptop },
  { id: 'privacy', label: 'Privacy Transparency', icon: ShieldCheck },
  { id: 'troubleshooting', label: 'Troubleshooting', icon: HelpCircle },
];

function EmployeeMonitoringV2Content() {
  const {
    employeeSession,
    isDeviceSwitcherOpen,
    setIsDeviceSwitcherOpen,
    handleSwitchDevice,
  } = useMonitoringV2Context();

  const [activeTab, setActiveTab] = useState('session');

  const isLaptop = employeeSession.currentDeviceMode === 'LAPTOP_PC';
  const isPhone = employeeSession.currentDeviceMode === 'PHONE';

  const renderActiveSection = () => {
    switch (activeTab) {
      case 'devices':
        return <DeviceManagementPage />;
      case 'privacy':
        return <PrivacyTransparencyPage />;
      case 'troubleshooting':
        return <TroubleshootingPage />;
      case 'session':
      default:
        return <WorkSessionPage />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header (inside existing Niyantran container) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <span>My Monitoring V2</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30 font-medium">
                  Personal Workspace
                </span>
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Transparent personal telemetry, session controls & active device management
              </p>
            </div>
          </div>
        </div>

        {/* Compact Header Device Switcher: [ Phone | Laptop / PC | Switch Device ] */}
        <div className="flex items-center gap-2.5">
          <div className="inline-flex items-center rounded-lg bg-card border border-border/80 p-1 text-xs">
            <button
              type="button"
              onClick={() => handleSwitchDevice('PHONE')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                isPhone
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Phone</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchDevice('LAPTOP_PC')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                isLaptop
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Laptop className="w-3.5 h-3.5" />
              <span>Laptop / PC</span>
            </button>

            <span className="w-px h-4 bg-border/60 mx-1" />

            <button
              type="button"
              onClick={() => setIsDeviceSwitcherOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-foreground/80 hover:text-primary transition-colors cursor-pointer"
              title="Open Device Handoff Dialog"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Switch Device</span>
            </button>
          </div>

          <Badge
            variant={
              employeeSession.status === 'ACTIVE'
                ? 'success'
                : employeeSession.status === 'PAUSED'
                ? 'warning'
                : 'neutral'
            }
            className="hidden sm:inline-flex"
          >
            <Circle className="w-2 h-2 fill-current animate-pulse" />
            <span>{employeeSession.status}</span>
          </Badge>
        </div>
      </div>

      {/* Local Horizontal Sub-Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none border-b border-border/40">
        {EMPLOYEE_LOCAL_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card/80'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Section Content */}
      <div className="pt-2 animate-fade-in">
        {renderActiveSection()}
      </div>

      {/* Global Device Switcher Dialog */}
      <DeviceSwitcherModal
        isOpen={isDeviceSwitcherOpen}
        onClose={() => setIsDeviceSwitcherOpen(false)}
        currentMode={employeeSession.currentDeviceMode}
        onConfirmSwitch={handleSwitchDevice}
      />
    </div>
  );
}

export function EmployeeMonitoringV2Page() {
  return (
    <MonitoringV2Provider>
      <EmployeeMonitoringV2Content />
    </MonitoringV2Provider>
  );
}

export default EmployeeMonitoringV2Page;
