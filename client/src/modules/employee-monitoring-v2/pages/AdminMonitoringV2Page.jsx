/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Admin Monitoring Console Page (Integrated Inside Niyantran DashboardLayout)
 *
 * Reuses existing Infiverse layout, header, sidebar, and theme.
 * Zero duplicate application shells or sidebars.
 */

import React, { useState } from 'react';
import { useAuth } from '../../../context/auth-context';
import { MonitoringV2Provider, useMonitoringV2Context } from '../context/MonitoringV2Context';
import PrivacyShieldBadge from '../components/common/PrivacyShieldBadge';
import DeviceSwitcherModal from '../components/common/DeviceSwitcherModal';
import Button from '../components/ui/Button';

// Admin Content Sections
import AdminDashboardPage from '../admin/pages/AdminDashboardPage';
import LiveTeamPage from '../admin/pages/LiveTeamPage';
import DailyMonthlyPage from '../admin/pages/DailyMonthlyPage';
import EmployeeActivityPage from '../admin/pages/EmployeeActivityPage';
import ReportsPage from '../admin/pages/ReportsPage';
import TrinetraAiPage from '../admin/pages/TrinetraAiPage';
import AlertsPage from '../admin/pages/AlertsPage';
import AgentHealthPage from '../admin/pages/AgentHealthPage';
import PoliciesPage from '../admin/pages/PoliciesPage';
import WhitelistPage from '../admin/pages/WhitelistPage';
import BulkOperationsPage from '../admin/pages/BulkOperationsPage';
import AuditLogsPage from '../admin/pages/AuditLogsPage';

import {
  LayoutDashboard,
  Users,
  TrendingUp,
  UserCheck,
  FileSpreadsheet,
  Sparkles,
  BellRing,
  Cpu,
  ShieldAlert,
  ListFilter,
  Layers,
  FileText,
  RefreshCw,
  Filter,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';
import { MOCK_DEPARTMENTS } from '../mocks/mockFleetData';

const LOCAL_TABS = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'live-team', label: 'Live Team', icon: Users, badge: 'Live' },
  { id: 'daily-monthly', label: 'Daily & Monthly', icon: TrendingUp },
  { id: 'employee-activity', label: 'Employee Activity', icon: UserCheck },
  { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
  { id: 'ai-insights', label: 'AI Insights', icon: Sparkles, badge: 'TRINETRA' },
  { id: 'alerts', label: 'Alerts', icon: BellRing },
  { id: 'agent-health', label: 'Agent Health', icon: Cpu },
  { id: 'policies', label: 'Policies', icon: ShieldAlert },
  { id: 'whitelist', label: 'Whitelist', icon: ListFilter },
  { id: 'bulk-ops', label: 'Bulk Ops', icon: Layers },
  { id: 'audit-logs', label: 'Audit Logs', icon: FileText },
];

function AdminMonitoringV2Content() {
  const { user } = useAuth();
  const {
    departmentFilter,
    setDepartmentFilter,
    lastRefreshed,
    handleRefreshTelemetry,
    isDeviceSwitcherOpen,
    setIsDeviceSwitcherOpen,
    employeeSession,
    handleSwitchDevice,
  } = useMonitoringV2Context();

  const [activeTab, setActiveTab] = useState('dashboard');

  // Presentation-level role check (Admin, SuperAdmin, Manager only)
  const isAdmin = user?.role === 'Admin' || user?.role === 'SuperAdmin' || user?.role === 'Manager' || !user;

  if (!isAdmin) {
    return (
      <div className="min-h-[450px] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4 p-8 rounded-2xl border border-destructive/30 bg-card shadow-xl">
          <div className="w-12 h-12 mx-auto rounded-full bg-destructive/10 text-destructive flex items-center justify-center border border-destructive/20">
            <ShieldX className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">Admin Access Restricted</h3>
            <p className="text-xs text-destructive font-medium mt-0.5">HTTP 403 — Insufficient Role Scope</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Employee Monitoring V2 administrative telemetry is restricted to Administrators and Department Leads.
            Please access your personal workspace via <span className="font-semibold text-primary">My Monitoring V2</span>.
          </p>
          <div className="pt-2">
            <a
              href="/monitoring-v2/employee"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Go to My Monitoring V2
            </a>
          </div>
        </div>
      </div>
    );
  }

  const renderActiveSection = () => {
    switch (activeTab) {
      case 'live-team':
        return <LiveTeamPage />;
      case 'daily-monthly':
        return <DailyMonthlyPage />;
      case 'employee-activity':
        return <EmployeeActivityPage />;
      case 'reports':
        return <ReportsPage />;
      case 'ai-insights':
        return <TrinetraAiPage />;
      case 'alerts':
        return <AlertsPage />;
      case 'agent-health':
        return <AgentHealthPage />;
      case 'policies':
        return <PoliciesPage />;
      case 'whitelist':
        return <WhitelistPage />;
      case 'bulk-ops':
        return <BulkOperationsPage />;
      case 'audit-logs':
        return <AuditLogsPage />;
      case 'dashboard':
      default:
        return <AdminDashboardPage />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header (rendered inside existing Niyantran content container) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <span>Employee Monitoring V2</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30 font-medium">
                  Independent Engine
                </span>
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Privacy-preserving workstation telemetry & fleet observability • Zero screen capture or raw keylogging
              </p>
            </div>
          </div>
        </div>

        {/* Header Controls: Department Filter + Refresh Telemetry */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-card border border-border/70 rounded-lg px-2.5 py-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="bg-transparent text-foreground focus:outline-none cursor-pointer text-xs"
            >
              {MOCK_DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept} className="bg-popover text-popover-foreground">
                  {dept}
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="outline"
            size="sm"
            icon={RefreshCw}
            onClick={handleRefreshTelemetry}
            className="text-xs"
          >
            <span>Refresh</span>
            <span className="text-[10px] text-muted-foreground font-mono">({lastRefreshed})</span>
          </Button>

          <PrivacyShieldBadge compact />
        </div>
      </div>

      {/* Compact Local Navigation Tabs (Horizontal pills, not another global sidebar!) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none border-b border-border/40">
        {LOCAL_TABS.map((tab) => {
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
              {tab.badge && (
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                    isActive
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-primary/10 text-primary border border-primary/20'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active Section Content */}
      <div className="pt-2 animate-fade-in">
        {renderActiveSection()}
      </div>

      {/* Global Device Switcher Dialog (if opened) */}
      <DeviceSwitcherModal
        isOpen={isDeviceSwitcherOpen}
        onClose={() => setIsDeviceSwitcherOpen(false)}
        currentMode={employeeSession.currentDeviceMode}
        onConfirmSwitch={handleSwitchDevice}
      />
    </div>
  );
}

export function AdminMonitoringV2Page() {
  return (
    <MonitoringV2Provider>
      <AdminMonitoringV2Content />
    </MonitoringV2Provider>
  );
}

export default AdminMonitoringV2Page;
