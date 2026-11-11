import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Monitor,
  Activity,
  AlertTriangle,
  Users,
  Eye,
  Clock,
  TrendingUp,
  Shield,
  Camera,
  Globe,
  Play,
  Square,
  Search,
  Filter,
  Download,
  Brain,
  Zap,
  LayoutDashboard,
  Calendar as CalendarIcon,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import axios from 'axios';
import { api, API_URL } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

// Import monitoring components
import { TeamOverviewGrid } from '@/components/monitoring/TeamOverviewGrid';
import { EmployeeDetailModal } from '@/components/monitoring/EmployeeDetailModal';
import { DailyMonitoringView } from '@/components/monitoring/DailyMonitoringView';
import { MonthlyMonitoringView } from '@/components/monitoring/MonthlyMonitoringView';
import { MonitoringDashboard } from '@/components/monitoring/MonitoringDashboard';
import { ActivityChart } from '@/components/monitoring/ActivityChart';
import { ScreenshotGallery } from '@/components/monitoring/ScreenshotGallery';
import { AlertsPanel } from '@/components/monitoring/AlertsPanel';
import { ReportsGenerator } from '@/components/monitoring/ReportsGenerator';
import { BulkMonitoringControls } from '@/components/monitoring/BulkMonitoringControls';
import { AIInsightsPanel } from '@/components/monitoring/AIInsightsPanel';
import { WhitelistManager } from '@/components/monitoring/WhitelistManager';
import { ProductionDashboard } from '@/components/monitoring/ProductionDashboard';
import { TrinetraConsole } from '@/components/monitoring/TrinetraConsole';

export function EmployeeMonitoring() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Navigation & Filter States
  const [statusTab, setStatusTab] = useState('active'); // 'active' | 'exited' | 'all'
  const [viewMode, setViewMode] = useState('live'); // 'live' | 'daily' | 'monthly' | 'legacy' | 'screenshots' | ...
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [departments, setDepartments] = useState([]);

  // Live Summary State with cached counts to eliminate 0-active / 0-exited flash
  const [teamSummaryData, setTeamSummaryData] = useState(() => {
    try {
      const cached = sessionStorage.getItem('niyantran_monitoring_counts');
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          counts: parsed,
          summary: { totalEmployees: parsed.totalEmployees || 0, activeCount: parsed.activeCount || 0, idleCount: 0, awayCount: 0, avgTeamProductivity: 0 },
          employees: []
        };
      }
    } catch (e) {}
    return {
      summary: { totalEmployees: 0, activeCount: 0, idleCount: 0, awayCount: 0, avgTeamProductivity: 0 },
      employees: []
    };
  });
  const [loadingTeamSummary, setLoadingTeamSummary] = useState(true);

  // Employee Selection for 1-Click Detail View Modal
  const [detailEmployee, setDetailEmployee] = useState(null);

  // Legacy Selected Employee & Status
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [monitoringStatus, setMonitoringStatus] = useState({});
  const [intelligentMode, setIntelligentMode] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchDepartments();
  }, []);

  useEffect(() => {
    fetchTeamSummary();
  }, [statusTab, filterDepartment, searchQuery]);

  useEffect(() => {
    // Auto-refresh real-time summary every 15 seconds when on live view mode
    if (viewMode === 'live' && !searchQuery) {
      const interval = setInterval(() => fetchTeamSummary(true), 15000);
      return () => clearInterval(interval);
    }
  }, [viewMode, statusTab, filterDepartment, searchQuery]);

  const fetchTeamSummary = async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) {
      setLoadingTeamSummary(true);
    }
    try {
      const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
      const selectedBranch = localStorage.getItem('selectedBranch') || localStorage.getItem('branch');
      const response = await axios.get(
        `${API_URL}/monitoring/team-summary?statusTab=${statusTab}&department=${filterDepartment}&search=${encodeURIComponent(searchQuery)}`,
        {
          headers: {
            'x-auth-token': token,
            Authorization: `Bearer ${token}`,
            ...(selectedBranch && selectedBranch !== 'all' ? { 'x-branch': selectedBranch } : {})
          }
        }
      );

      if (response.data.success) {
        const fetchedEmployees = response.data.employees || [];
        const counts = response.data.counts || {};
        try {
          if (counts && typeof counts.activeCount === 'number') {
            sessionStorage.setItem('niyantran_monitoring_counts', JSON.stringify(counts));
          }
        } catch (e) {}

        setTeamSummaryData({
          counts,
          summary: response.data.summary || {},
          employees: fetchedEmployees
        });

        // Automatically update selected employee when search query is entered
        if (fetchedEmployees.length > 0) {
          if (searchQuery.trim() !== '') {
            setSelectedEmployee(fetchedEmployees[0]);
          } else if (!selectedEmployee) {
            setSelectedEmployee(fetchedEmployees[0]);
          } else {
            const exists = fetchedEmployees.find(e => (e._id || e.employeeId) === (selectedEmployee._id || selectedEmployee.employeeId));
            if (!exists) {
              setSelectedEmployee(fetchedEmployees[0]);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching team monitoring summary:', error);
    } finally {
      if (!isBackgroundRefresh) {
        setLoadingTeamSummary(false);
      }
    }
  };

  const fetchDepartments = async () => {
    try {
      const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
      const selectedBranch = localStorage.getItem('selectedBranch') || localStorage.getItem('branch');
      const response = await axios.get(`${API_URL}/departments`, {
        headers: {
          'x-auth-token': token,
          Authorization: `Bearer ${token}`,
          ...(selectedBranch && selectedBranch !== 'all' ? { 'x-branch': selectedBranch } : {})
        }
      });

      if (response.data.success && response.data.data) {
        setDepartments(response.data.data);
      } else if (Array.isArray(response.data)) {
        setDepartments(response.data);
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  const handleStartMonitoring = async () => {
    if (!selectedEmployee) return;
    setActionLoading(true);
    try {
      const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
      await axios.post(
        `${API_URL}/monitoring/start/${selectedEmployee._id || selectedEmployee.employeeId}`,
        { intelligentMode },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast({
        title: 'Success',
        description: `Monitoring started for ${selectedEmployee.name}`
      });
      fetchTeamSummary(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to start monitoring',
        type: 'destructive'
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopMonitoring = async () => {
    if (!selectedEmployee) return;
    setActionLoading(true);
    try {
      const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
      await axios.post(
        `${API_URL}/monitoring/stop/${selectedEmployee._id || selectedEmployee.employeeId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast({
        title: 'Success',
        description: `Monitoring stopped for ${selectedEmployee.name}`
      });
      fetchTeamSummary(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to stop monitoring',
        type: 'destructive'
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Filter and sort employees client-side for live view search
  const filteredTeamEmployees = useMemo(() => {
    const list = teamSummaryData.employees.filter((emp) => {
      const matchesSearch =
        emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });

    return list.sort((a, b) => {
      const aExited = a.stillExist === 0 || a.currentStatus === 'Exited';
      const bExited = b.stillExist === 0 || b.currentStatus === 'Exited';
      if (aExited !== bExited) return aExited ? 1 : -1;

      const aStarted = (a.hasStartedDay || a.currentStatus === 'Active' || a.currentStatus === 'Idle' || a.activeSeconds > 0 || a.keystrokesToday > 0) ? 1 : 0;
      const bStarted = (b.hasStartedDay || b.currentStatus === 'Active' || b.currentStatus === 'Idle' || b.activeSeconds > 0 || b.keystrokesToday > 0) ? 1 : 0;
      if (aStarted !== bStarted) return bStarted - aStarted;

      return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    });
  }, [teamSummaryData.employees, searchQuery]);

  // Filter counts from global backend counts if available
  const hasLoadedCounts = teamSummaryData.counts && typeof teamSummaryData.counts.activeCount === 'number';
  const activeCount = teamSummaryData.counts?.activeCount ?? (teamSummaryData.employees.length > 0 ? teamSummaryData.employees.filter((e) => e.stillExist === 1).length : null);
  const exitedCount = teamSummaryData.counts?.exitedCount ?? (teamSummaryData.employees.length > 0 ? teamSummaryData.employees.filter((e) => e.stillExist === 0).length : null);
  const totalCount = teamSummaryData.counts?.totalEmployees ?? (teamSummaryData.employees.length > 0 ? teamSummaryData.employees.length : null);

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 space-y-6">
      {/* ========== PAGE HEADER ========== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
            <Monitor className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Employee Monitoring Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Comprehensive real-time activity tracking, daily performance, and monthly analytics
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchTeamSummary()}
            className="flex items-center gap-2 font-semibold"
          >
            <RefreshCw className={`h-4 w-4 ${loadingTeamSummary ? 'animate-spin' : ''}`} />
            Refresh Telemetry
          </Button>
        </div>
      </div>

      {/* ========== SECTION 1: USER STATUS FILTER TABS & SEARCH BAR ========== */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm">
        {/* User Status Tabs: Active | Exited | All */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="ghost"
            onClick={() => setStatusTab('active')}
            className={`font-bold text-xs sm:text-sm rounded-xl transition-all h-10 px-4 flex items-center gap-2 ${
              statusTab === 'active'
                ? 'bg-emerald-600 text-white font-extrabold shadow-lg shadow-emerald-950/50 ring-2 ring-emerald-400 border border-emerald-400'
                : 'bg-zinc-900/80 text-emerald-400 hover:bg-emerald-950/60 border border-emerald-900/50'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Active Users {activeCount !== null ? `(${activeCount})` : (loadingTeamSummary ? '(...)' : '(0)')}
          </Button>

          <Button
            variant="ghost"
            onClick={() => setStatusTab('exited')}
            className={`font-bold text-xs sm:text-sm rounded-xl transition-all h-10 px-4 flex items-center gap-2 ${
              statusTab === 'exited'
                ? 'bg-rose-600 text-white font-extrabold shadow-lg shadow-rose-950/50 ring-2 ring-rose-400 border border-rose-400'
                : 'bg-zinc-900/80 text-rose-400 hover:bg-rose-950/60 border border-rose-900/50'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-rose-400"></span>
            Exited Users {exitedCount !== null ? `(${exitedCount})` : (loadingTeamSummary ? '(...)' : '(0)')}
          </Button>

          <Button
            variant="ghost"
            onClick={() => setStatusTab('all')}
            className={`font-bold text-xs sm:text-sm rounded-xl transition-all h-10 px-4 flex items-center gap-2 ${
              statusTab === 'all'
                ? 'bg-blue-600 text-white font-extrabold shadow-lg shadow-blue-950/50 ring-2 ring-blue-400 border border-blue-400'
                : 'bg-zinc-900/80 text-blue-400 hover:bg-blue-950/60 border border-blue-900/50'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-blue-400"></span>
            All Users {totalCount !== null ? `(${totalCount})` : (loadingTeamSummary ? '(...)' : '(0)')}
          </Button>
        </div>

        {/* Filters: Prominent Search Input & Department Dropdown */}
        <div className="flex items-center gap-3 flex-wrap w-full lg:w-auto">
          {/* Search Box */}
          <div className="relative flex-1 sm:w-72 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by employee name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8 h-10 text-xs sm:text-sm bg-background border-border rounded-xl focus-visible:ring-2 focus-visible:ring-primary"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground font-bold p-1"
              >
                ✕
              </button>
            )}
          </div>

          {/* Department Filter */}
          <Select value={filterDepartment} onValueChange={setFilterDepartment}>
            <SelectTrigger className="w-full sm:w-48 h-10 text-xs sm:text-sm bg-background border-border rounded-xl">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {Array.isArray(departments) &&
                departments.map((dept) => (
                  <SelectItem key={dept._id} value={dept._id}>
                    {dept.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ========== SECTION 2: VIEW MODE TABS NAVIGATION ========== */}
      <Tabs value={viewMode} onValueChange={setViewMode} className="w-full">
        <TabsList className="h-auto p-1.5 bg-zinc-950/90 border border-zinc-800 flex flex-wrap gap-1.5 rounded-2xl shadow-inner">
          <TabsTrigger
            value="live"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all text-zinc-400 hover:text-white bg-transparent data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-900/40 data-[state=active]:border data-[state=active]:border-blue-400 ring-2 ring-transparent data-[state=active]:ring-blue-500/30"
          >
            <LayoutDashboard className="h-4 w-4" />
            Live Team Overview
          </TabsTrigger>

          <TabsTrigger
            value="daily"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all text-zinc-400 hover:text-white bg-transparent data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-900/40 data-[state=active]:border data-[state=active]:border-blue-400 ring-2 ring-transparent data-[state=active]:ring-blue-500/30"
          >
            <CalendarIcon className="h-4 w-4" />
            Daily View
          </TabsTrigger>

          <TabsTrigger
            value="monthly"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all text-zinc-400 hover:text-white bg-transparent data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-900/40 data-[state=active]:border data-[state=active]:border-blue-400 ring-2 ring-transparent data-[state=active]:ring-blue-500/30"
          >
            <TrendingUp className="h-4 w-4" />
            Monthly View
          </TabsTrigger>

          <TabsTrigger
            value="legacy"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all text-zinc-400 hover:text-white bg-transparent data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-900/40 data-[state=active]:border data-[state=active]:border-blue-400 ring-2 ring-transparent data-[state=active]:ring-blue-500/30"
          >
            <Activity className="h-4 w-4" />
            Single Dashboard View
          </TabsTrigger>

          <TabsTrigger
            value="screenshots"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-zinc-400 hover:text-white bg-transparent data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-900/40 data-[state=active]:border data-[state=active]:border-blue-400 ring-2 ring-transparent data-[state=active]:ring-blue-500/30"
          >
            <Camera className="h-3.5 w-3.5" />
            Screenshots
          </TabsTrigger>

          <TabsTrigger
            value="alerts"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-zinc-400 hover:text-white bg-transparent data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-900/40 data-[state=active]:border data-[state=active]:border-blue-400 ring-2 ring-transparent data-[state=active]:ring-blue-500/30"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Alerts
          </TabsTrigger>

          <TabsTrigger
            value="ai-insights"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-zinc-400 hover:text-white bg-transparent data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-900/40 data-[state=active]:border data-[state=active]:border-blue-400 ring-2 ring-transparent data-[state=active]:ring-blue-500/30"
          >
            <Brain className="h-3.5 w-3.5" />
            AI Insights
          </TabsTrigger>

          <TabsTrigger
            value="production"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-zinc-400 hover:text-white bg-transparent data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-900/40 data-[state=active]:border data-[state=active]:border-blue-400 ring-2 ring-transparent data-[state=active]:ring-blue-500/30"
          >
            <Zap className="h-3.5 w-3.5" />
            Production
          </TabsTrigger>

          <TabsTrigger
            value="trinetra"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-zinc-400 hover:text-white bg-transparent data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-indigo-900/40 data-[state=active]:border data-[state=active]:border-indigo-400 ring-2 ring-transparent data-[state=active]:ring-indigo-500/30"
          >
            <Eye className="h-3.5 w-3.5" />
            TRINETRA AI
          </TabsTrigger>

          <TabsTrigger
            value="reports"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-zinc-400 hover:text-white bg-transparent data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-900/40 data-[state=active]:border data-[state=active]:border-blue-400 ring-2 ring-transparent data-[state=active]:ring-blue-500/30"
          >
            <Download className="h-3.5 w-3.5" />
            Reports
          </TabsTrigger>

          <TabsTrigger
            value="whitelist"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-zinc-400 hover:text-white bg-transparent data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-900/40 data-[state=active]:border data-[state=active]:border-blue-400 ring-2 ring-transparent data-[state=active]:ring-blue-500/30"
          >
            <Globe className="h-3.5 w-3.5" />
            Whitelist
          </TabsTrigger>

          <TabsTrigger
            value="bulk"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-zinc-400 hover:text-white bg-transparent data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-900/40 data-[state=active]:border data-[state=active]:border-blue-400 ring-2 ring-transparent data-[state=active]:ring-blue-500/30"
          >
            <Users className="h-3.5 w-3.5" />
            Bulk
          </TabsTrigger>
        </TabsList>

        {/* ========== VIEW CONTENT CONTAINERS ========== */}

        {/* 1. LIVE TEAM OVERVIEW GRID (EVERY EMPLOYEE TOGETHER ON A SINGLE DASHBOARD) */}
        <TabsContent value="live" className="mt-6">
          <TeamOverviewGrid
            employees={teamSummaryData.employees}
            summary={teamSummaryData.summary}
            loading={loadingTeamSummary}
            onSelectEmployee={(emp) => setDetailEmployee(emp)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            departmentFilter={filterDepartment}
            onDepartmentChange={setFilterDepartment}
            departments={departments}
          />
        </TabsContent>

        {/* 2. DAILY VIEW */}
        <TabsContent value="daily" className="mt-6">
          <DailyMonitoringView
            onSelectEmployee={(emp) => setDetailEmployee(emp)}
            departmentFilter={filterDepartment}
            statusTab={statusTab}
            searchQuery={searchQuery}
          />
        </TabsContent>

        {/* 3. MONTHLY VIEW */}
        <TabsContent value="monthly" className="mt-6">
          <MonthlyMonitoringView
            onSelectEmployee={(emp) => setDetailEmployee(emp)}
            departmentFilter={filterDepartment}
            statusTab={statusTab}
            searchQuery={searchQuery}
            selectedEmployee={selectedEmployee}
            employees={teamSummaryData.employees}
          />
        </TabsContent>

        {/* 4. SINGLE DASHBOARD VIEW */}
        <TabsContent value="legacy" className="mt-6">
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            <div className="w-full lg:w-80 flex-shrink-0 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold">Select Employee</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                    {teamSummaryData.employees
                      .filter((emp) => {
                        if (statusTab === 'active') return emp.stillExist === 1;
                        if (statusTab === 'exited') return emp.stillExist === 0;
                        return true;
                      })
                      .map((emp) => (
                        <button
                          key={emp._id}
                          onClick={() => setSelectedEmployee(emp)}
                          className={`w-full text-left p-3 rounded-xl transition-all ${
                            selectedEmployee?._id === emp._id
                              ? 'bg-primary/10 border border-primary font-bold'
                              : 'bg-muted/40 hover:bg-muted border border-transparent'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <p className="font-semibold text-sm truncate">{emp.name}</p>
                            {emp.stillExist === 0 ? (
                              <Badge variant="outline" className="text-[10px] text-rose-400 border-rose-500/30 bg-rose-500/10 px-1.5 py-0 flex-shrink-0">
                                Exited
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0 flex-shrink-0">
                                Active
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{emp.email}</p>
                        </button>
                      ))}
                  </div>
                </CardContent>
              </Card>

              {/* Start/Stop Monitoring Controls */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold">Monitoring Control</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <span className="text-xs font-medium">Intelligent Mode</span>
                    <Switch checked={intelligentMode} onCheckedChange={setIntelligentMode} />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleStartMonitoring}
                      disabled={actionLoading || !selectedEmployee}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
                    >
                      <Play className="h-3.5 w-3.5 mr-1" /> Start
                    </Button>
                    <Button
                      onClick={handleStopMonitoring}
                      disabled={actionLoading || !selectedEmployee}
                      variant="destructive"
                      className="flex-1 font-semibold text-xs"
                    >
                      <Square className="h-3.5 w-3.5 mr-1" /> Stop
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex-1 min-w-0 w-full">
              {selectedEmployee ? (
                <MonitoringDashboard employee={selectedEmployee} monitoringStatus={monitoringStatus} />
              ) : (
                <Card className="p-12 text-center">
                  <p className="text-muted-foreground">Select an employee from the sidebar</p>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* OTHER SUB-TABS */}
        <TabsContent value="screenshots" className="mt-6">
          <ScreenshotGallery employee={selectedEmployee || teamSummaryData.employees[0]} />
        </TabsContent>

        <TabsContent value="alerts" className="mt-6">
          <AlertsPanel employee={selectedEmployee || teamSummaryData.employees[0]} />
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <ActivityChart employee={selectedEmployee || teamSummaryData.employees[0]} />
        </TabsContent>

        <TabsContent value="ai-insights" className="mt-6">
          <AIInsightsPanel
            employee={selectedEmployee || teamSummaryData.employees[0]}
            allEmployees={teamSummaryData.employees}
            onSelectEmployee={setSelectedEmployee}
          />
        </TabsContent>

        <TabsContent value="production" className="mt-6">
          <ProductionDashboard employee={selectedEmployee || teamSummaryData.employees[0]} />
        </TabsContent>

        <TabsContent value="trinetra" className="mt-6">
          <TrinetraConsole />
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          <ReportsGenerator
            employee={selectedEmployee || teamSummaryData.employees[0]}
            employees={teamSummaryData.employees}
            onSelectEmployee={setSelectedEmployee}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            departments={departments}
          />
        </TabsContent>

        <TabsContent value="whitelist" className="mt-6">
          <WhitelistManager />
        </TabsContent>

        <TabsContent value="bulk" className="mt-6">
          <BulkMonitoringControls departments={departments} />
        </TabsContent>
      </Tabs>

      {/* ========== SECTION 3: 1-CLICK EMPLOYEE DETAILED VIEW MODAL ========== */}
      {detailEmployee && (
        <EmployeeDetailModal
          employee={detailEmployee}
          onClose={() => setDetailEmployee(null)}
        />
      )}

      <Toaster />
    </div>
  );
}
