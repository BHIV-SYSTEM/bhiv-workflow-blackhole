import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Calendar as CalendarIcon,
  Clock,
  Clock3,
  Keyboard,
  Mouse,
  TrendingUp,
  Zap,
  Users,
  Eye,
  Search,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Check,
  User as UserIcon,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  ArrowLeft,
  X,
  Sparkles,
  Filter,
  RefreshCw,
  Building,
  MapPin,
  Laptop
} from 'lucide-react';
import axios from 'axios';
import { API_URL } from '@/lib/api';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';

export function MonthlyMonitoringView({
  onSelectEmployee,
  departmentFilter = 'all',
  statusTab = 'active',
  searchQuery: externalSearch = '',
  selectedEmployee: initialSelectedEmployee = null,
  employees: propEmployees = []
}) {
  // Current month state in YYYY-MM format
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });

  // Sub-view: 'individual' (Primary individual user view) | 'team' (All team aggregate overview)
  const [subView, setSubView] = useState('individual');

  // Selected Employee for individual full monthly view
  const [selectedEmp, setSelectedEmp] = useState(initialSelectedEmployee);
  const [employeeSearch, setEmployeeSearch] = useState(externalSearch || '');
  const [dropdownSearch, setDropdownSearch] = useState('');
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);

  // Data states
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [teamMonthlyData, setTeamMonthlyData] = useState({
    overallSummary: {
      totalActiveHours: '0h 0m',
      totalIdleHours: '0h 0m',
      avgProductivityScore: 0,
      totalKeystrokes: 0,
      totalMouseActivity: 0,
      overallProductivityEfficiency: 'Low Efficiency'
    },
    dayByDayBreakdown: [],
    employeePerformance: []
  });

  // Individual employee monthly breakdown state
  const [loadingEmpBreakdown, setLoadingEmpBreakdown] = useState(false);
  const [empMonthlyData, setEmpMonthlyData] = useState({
    employee: null,
    dailyBreakdown: []
  });

  // Direct employees list fallback (guarantees selector is NEVER empty)
  const [directEmployees, setDirectEmployees] = useState([]);

  // Table filter inside individual day breakdown (all | worked | weekend)
  const [dayFilter, setDayFilter] = useState('all');

  // Sync external search query
  useEffect(() => {
    if (externalSearch !== undefined && externalSearch !== null) {
      setEmployeeSearch(externalSearch);
    }
  }, [externalSearch]);

  // Sync initialSelectedEmployee when prop updates
  useEffect(() => {
    if (initialSelectedEmployee) {
      setSelectedEmp(initialSelectedEmployee);
    }
  }, [initialSelectedEmployee]);

  // Fetch direct employees list to ensure employee combobox is always populated
  useEffect(() => {
    fetchDirectEmployees();
  }, [statusTab, departmentFilter]);

  const fetchDirectEmployees = async () => {
    try {
      const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/monitoring/team-summary?statusTab=${statusTab}&department=${departmentFilter}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.success && Array.isArray(response.data.employees) && response.data.employees.length > 0) {
        setDirectEmployees(response.data.employees);
      }
    } catch (e) {
      console.warn('Direct employees fetch error:', e);
    }
  };

  // Fetch Team Monthly Summary when month, department, or statusTab changes
  useEffect(() => {
    fetchTeamMonthlySummary();
  }, [selectedMonth, departmentFilter, statusTab]);

  // Fetch Individual Employee Breakdown when selectedEmp or selectedMonth changes
  useEffect(() => {
    if (selectedEmp?._id || selectedEmp?.employeeId) {
      fetchEmployeeMonthlyBreakdown(selectedEmp._id || selectedEmp.employeeId, selectedEmp);
    }
  }, [selectedEmp?._id, selectedEmp?.employeeId, selectedMonth]);

  const fetchTeamMonthlySummary = async () => {
    setLoadingTeam(true);
    try {
      const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/monitoring/monthly-summary?month=${selectedMonth}&department=${departmentFilter}&statusTab=${statusTab}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        const perf = response.data.employeePerformance || [];
        setTeamMonthlyData({
          overallSummary: response.data.overallSummary || {},
          dayByDayBreakdown: response.data.dayByDayBreakdown || [],
          employeePerformance: perf
        });

        // Automatically select first matching employee if none selected
        if (perf.length > 0) {
          const validSelected = selectedEmp && perf.find(e => String(e.employeeId || e._id) === String(selectedEmp._id || selectedEmp.employeeId));
          if (!validSelected) {
            const defaultEmp = (statusTab === 'active')
              ? perf.find(e => e.stillExist === 1) || perf[0]
              : perf[0];
            setSelectedEmp(defaultEmp);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching monthly summary:', error);
    } finally {
      setLoadingTeam(false);
    }
  };

  const fetchEmployeeMonthlyBreakdown = async (empId, empObj = null) => {
    if (!empId) return;
    if (empObj) {
      setSelectedEmp(empObj);
      setEmpMonthlyData(prev => ({
        ...prev,
        employee: empObj
      }));
    }
    setLoadingEmpBreakdown(true);
    try {
      const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/monitoring/monthly-employee-breakdown?employeeId=${empId}&month=${selectedMonth}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setEmpMonthlyData({
          employee: response.data.employee || empObj || selectedEmp,
          dailyBreakdown: response.data.dailyBreakdown || []
        });
      }
    } catch (error) {
      console.error('Error fetching employee monthly breakdown:', error);
    } finally {
      setLoadingEmpBreakdown(false);
    }
  };

  // Month navigation helpers
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const newY = prevDate.getFullYear();
    const newM = String(prevDate.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${newY}-${newM}`);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(y, m, 1);
    const newY = nextDate.getFullYear();
    const newM = String(nextDate.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${newY}-${newM}`);
  };

  const formatMonthTitle = (monthStr) => {
    try {
      const [year, month] = monthStr.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    } catch (e) {
      return monthStr;
    }
  };

  // Combine all sources: teamMonthlyData, propEmployees, and directEmployees with deduplication
  const availableEmployees = useMemo(() => {
    const list = [
      ...(Array.isArray(teamMonthlyData.employeePerformance) ? teamMonthlyData.employeePerformance : []),
      ...(Array.isArray(propEmployees) ? propEmployees : []),
      ...(Array.isArray(directEmployees) ? directEmployees : [])
    ];
    const seen = new Set();
    const unique = [];
    for (const emp of list) {
      const id = String(emp.employeeId || emp._id || '');
      if (id && !seen.has(id)) {
        seen.add(id);
        unique.push(emp);
      }
    }
    return unique;
  }, [teamMonthlyData.employeePerformance, propEmployees, directEmployees]);

  // Auto-select active employee when availableEmployees loads and none is selected
  // Filter employees for dropdown/selector strictly enforcing statusTab, dropdownSearch, and day-started sorting
  const filteredEmployeesList = useMemo(() => {
    const list = availableEmployees.filter((emp) => {
      // Strict statusTab filter
      if (statusTab === 'active' && emp.stillExist === 0) return false;
      if (statusTab === 'exited' && emp.stillExist === 1) return false;

      if (!dropdownSearch.trim()) return true;
      const q = dropdownSearch.toLowerCase().trim();
      const empName = (emp.name || '').toLowerCase();
      const empEmail = (emp.email || '').toLowerCase();
      const dept = typeof emp.department === 'object' ? (emp.department?.name || '') : (emp.department || '');
      const empDept = dept.toLowerCase();

      return empName.includes(q) || empEmail.includes(q) || empDept.includes(q);
    });

    return list.sort((a, b) => {
      // Started day today comes first
      const aStarted = (a.hasStartedToday || a.hasStartedDay || a.currentStatus === 'Active' || a.currentStatus === 'Idle' || a.activeSeconds > 0) ? 1 : 0;
      const bStarted = (b.hasStartedToday || b.hasStartedDay || b.currentStatus === 'Active' || b.currentStatus === 'Idle' || b.activeSeconds > 0) ? 1 : 0;
      if (aStarted !== bStarted) return bStarted - aStarted;

      // Alphabetical A-Z by name
      return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    });
  }, [availableEmployees, statusTab, dropdownSearch]);

  // Auto-select active employee when filteredEmployeesList loads and none is selected
  useEffect(() => {
    if (!selectedEmp && filteredEmployeesList.length > 0) {
      const defaultEmp = filteredEmployeesList[0];
      setSelectedEmp(defaultEmp);
      if (defaultEmp) {
        fetchEmployeeMonthlyBreakdown(defaultEmp.employeeId || defaultEmp._id, defaultEmp);
      }
    }
  }, [filteredEmployeesList, selectedEmp]);

  // Filter individual day-by-day records
  const filteredDailyBreakdown = useMemo(() => {
    if (!empMonthlyData.dailyBreakdown) return [];
    if (dayFilter === 'worked') {
      return empMonthlyData.dailyBreakdown.filter(
        d => d.status === 'Worked' || d.status === 'Completed Workday' || d.activeSeconds > 0
      );
    }
    if (dayFilter === 'weekend') {
      return empMonthlyData.dailyBreakdown.filter(d => d.status === 'Weekend');
    }
    return empMonthlyData.dailyBreakdown;
  }, [empMonthlyData.dailyBreakdown, dayFilter]);

  const getEfficiencyBadge = (efficiency, emp = null) => {
    if (emp && (emp.stillExist === 0 || emp.currentStatus === 'Exited')) {
      return <Badge className="bg-rose-500/15 text-rose-400 border border-rose-500/30 font-bold text-xs px-2.5 py-0.5">Account Exited</Badge>;
    }
    if (
      emp &&
      ((!emp.avgProductivityScore || emp.avgProductivityScore === 0) && (!emp.totalKeystrokes || emp.totalKeystrokes === 0))
    ) {
      return <Badge variant="outline" className="text-zinc-400 border-zinc-800 bg-zinc-900/40 font-medium text-xs px-2.5 py-0.5">💤 No Activity</Badge>;
    }

    switch (efficiency) {
      case 'High Efficiency':
        return <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold text-xs px-2.5 py-0.5">⚡ High Efficiency</Badge>;
      case 'Moderate Efficiency':
        return <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold text-xs px-2.5 py-0.5">⚖️ Moderate Efficiency</Badge>;
      case 'Low Efficiency':
        return <Badge className="bg-rose-500/15 text-rose-400 border border-rose-500/30 font-bold text-xs px-2.5 py-0.5">🔻 Low Efficiency</Badge>;
      case 'Weekend Off':
      case 'Weekend':
      case 'Off':
        return <Badge variant="outline" className="text-zinc-500 border-zinc-800 bg-zinc-900/60 font-medium text-xs px-2.5 py-0.5">☕ Weekend Off</Badge>;
      case 'Upcoming':
        return <Badge variant="outline" className="text-blue-400 border-blue-500/30 bg-blue-500/10 font-medium text-xs px-2.5 py-0.5">⏳ Upcoming</Badge>;
      case 'No Activity':
      case 'No Logs Today':
      case 'No Logs Recorded':
        return <Badge variant="outline" className="text-zinc-400 border-zinc-800 bg-zinc-900/40 font-medium text-xs px-2.5 py-0.5">💤 No Activity</Badge>;
      case 'Exited':
        return <Badge className="bg-rose-500/15 text-rose-400 border border-rose-500/30 font-bold text-xs px-2.5 py-0.5">Account Exited</Badge>;
      default:
        return <Badge variant="outline" className="text-zinc-400 border-zinc-800 bg-zinc-900/40 font-medium text-xs px-2.5 py-0.5">💤 No Activity</Badge>;
    }
  };

  const getDayStatusBadge = (status, activeSeconds) => {
    if (status === 'Exited') {
      return <Badge variant="outline" className="text-rose-400 border-rose-500/30 bg-rose-500/10 text-[10px]">Exited</Badge>;
    }
    if (status === 'Weekend' || status === 'Weekend Off') {
      return <Badge variant="outline" className="text-zinc-500 border-zinc-800 bg-zinc-900/60 text-[10px]">Weekend Off</Badge>;
    }
    if (status === 'Upcoming') {
      return <Badge variant="outline" className="text-blue-400 border-blue-500/30 bg-blue-500/10 text-[10px]">Upcoming</Badge>;
    }
    if (activeSeconds > 0 || status === 'Worked' || status === 'Completed Workday') {
      return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">Workday Active</Badge>;
    }
    return <Badge variant="outline" className="text-zinc-400 border-zinc-800 bg-zinc-900/40 text-[10px]">No Activity</Badge>;
  };

  // Mathematical verification: calculate overall monthly efficiency directly from worked days
  const calculatedMonthlyMetrics = useMemo(() => {
    const daily = empMonthlyData.dailyBreakdown || [];
    if (!daily || daily.length === 0) {
      return null;
    }

    const isExited = (empMonthlyData.employee?.stillExist === 0) || (selectedEmp?.stillExist === 0);
    if (isExited) {
      return {
        avgProductivityScore: 0,
        productivityEfficiency: 'Exited',
        workedDaysCount: 0
      };
    }

    // Days where employee actually worked (matches backend monthly-employee-breakdown criteria)
    const workedDays = daily.filter(d =>
      d.status === 'Worked' ||
      d.status === 'Completed Workday' ||
      (d.activeSeconds || 0) > 0 ||
      (d.logCount || 0) > 0 ||
      (d.productivityScore || 0) > 0
    );

    if (workedDays.length === 0) {
      return {
        avgProductivityScore: 0,
        productivityEfficiency: 'No Activity',
        workedDaysCount: 0
      };
    }

    const sumProd = workedDays.reduce((acc, d) => acc + (d.productivityScore || 0), 0);
    const avgProd = Math.round(sumProd / workedDays.length);

    let efficiency = 'Low Efficiency';
    if (avgProd >= 60) efficiency = 'High Efficiency';
    else if (avgProd >= 40) efficiency = 'Moderate Efficiency';

    return {
      avgProductivityScore: avgProd,
      productivityEfficiency: efficiency,
      workedDaysCount: workedDays.length
    };
  }, [empMonthlyData.dailyBreakdown, empMonthlyData.employee, selectedEmp]);

  const activeEmployeeObj = empMonthlyData.employee || selectedEmp;
  const isEmployeeExited = activeEmployeeObj?.stillExist === 0;
  const verifiedEfficiency = calculatedMonthlyMetrics
    ? calculatedMonthlyMetrics.productivityEfficiency
    : (isEmployeeExited ? 'Exited' : (activeEmployeeObj?.productivityEfficiency || 'No Activity'));
  const verifiedScore = calculatedMonthlyMetrics
    ? calculatedMonthlyMetrics.avgProductivityScore
    : (isEmployeeExited ? 0 : (activeEmployeeObj?.avgProductivityScore ?? 0));
  const verifiedWorkedDays = calculatedMonthlyMetrics
    ? calculatedMonthlyMetrics.workedDaysCount
    : (empMonthlyData.employee?.workedDaysCount ?? 0);

  return (
    <div className="space-y-6">
      {/* =========================================================================
          TOP BAR: MONTH SELECTOR & VIEW MODE TOGGLE (INDIVIDUAL VS TEAM)
         ========================================================================= */}
      <Card className="border-l-4 border-l-purple-500 bg-card shadow-sm border-border">
        <CardContent className="p-4 sm:p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-inner flex-shrink-0">
              <CalendarIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-extrabold tracking-tight text-foreground">
                  Monthly Performance Dashboard
                </h3>
                <Badge variant="outline" className="font-bold text-xs border-purple-500/30 text-purple-400 bg-purple-500/10">
                  {formatMonthTitle(selectedMonth)}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Comprehensive full-month telemetry, day-by-day trends, and employee activity breakdown
              </p>
            </div>
          </div>

          {/* Month Navigator & Sub-view Switcher */}
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-start lg:justify-end">
            {/* Previous Month Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevMonth}
              title="Previous Month"
              className="h-9 w-9 p-0 rounded-xl"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Native Month Input */}
            <div className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-xl border border-border">
              <span className="text-xs font-semibold text-muted-foreground hidden sm:inline">Month:</span>
              <Input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-auto h-7 text-xs bg-background border-none shadow-none font-bold p-1"
              />
            </div>

            {/* Next Month Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextMonth}
              title="Next Month"
              className="h-9 w-9 p-0 rounded-xl"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            {/* View Mode Toggle: Individual vs All Team */}
            <div className="flex items-center p-1 bg-zinc-950/80 border border-zinc-800 rounded-xl">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSubView('individual')}
                className={`text-xs font-bold rounded-lg h-7 px-3 transition-all ${
                  subView === 'individual'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <UserIcon className="h-3.5 w-3.5 mr-1.5" />
                Individual Employee View
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSubView('team')}
                className={`text-xs font-bold rounded-lg h-7 px-3 transition-all ${
                  subView === 'team'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Team Overview
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* =========================================================================
          SECTION A: INDIVIDUAL EMPLOYEE MONTHLY VIEW (USER-SPECIFIC FULL VIEW)
         ========================================================================= */}
      {subView === 'individual' && (
        <div className="space-y-6">
          {/* 1. EMPLOYEE SELECTOR & QUICK PICKER BAR */}
          <Card className="bg-card border-border shadow-sm">
            <CardContent className="p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                  <UserIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Selected Employee:
                    </span>
                    {activeEmployeeObj?.stillExist === 0 ? (
                      <Badge variant="outline" className="text-[10px] text-rose-400 border-rose-500/30 bg-rose-500/10 font-bold px-2 py-0">
                        Exited Employee
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10 font-bold px-2 py-0">
                        Active Employee
                      </Badge>
                    )}
                  </div>
                  <h4 className="text-base font-extrabold text-foreground truncate mt-0.5">
                    {activeEmployeeObj?.name || 'Select an employee'}
                  </h4>
                </div>
              </div>

              {/* Unified Searchable Employee Combobox & Refresh Button */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                <Popover
                  open={employeePickerOpen}
                  onOpenChange={(open) => {
                    setEmployeePickerOpen(open);
                    if (open) setDropdownSearch('');
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={employeePickerOpen}
                      className="w-full sm:w-80 h-10 justify-between bg-background border-border hover:border-primary/50 text-left font-normal rounded-xl px-3 transition-all shadow-sm"
                    >
                      {activeEmployeeObj ? (
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-sm">
                            {activeEmployeeObj.name ? activeEmployeeObj.name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div className="min-w-0 truncate">
                            <span className="font-bold text-xs text-foreground block truncate">
                              {activeEmployeeObj.name}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0 truncate max-w-[100px]">
                            • {typeof activeEmployeeObj.department === 'object' ? activeEmployeeObj.department?.name : (activeEmployeeObj.department || 'General')}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Select an employee...</span>
                      )}
                      <ChevronDown className={`h-4 w-4 ml-2 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${employeePickerOpen ? 'rotate-180 text-primary' : ''}`} />
                    </Button>
                  </PopoverTrigger>

                  <PopoverContent 
                    side="bottom"
                    align="end"
                    sideOffset={8}
                    avoidCollisions={false}
                    className="w-[320px] sm:w-[380px] p-0 z-[100] bg-zinc-950/95 backdrop-blur-xl border border-zinc-800 rounded-xl shadow-2xl text-zinc-100 overflow-hidden" 
                  >
                    {/* Search Bar inside Combobox */}
                    <div className="p-3 border-b border-zinc-800/80 bg-zinc-900/60">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                        <Input
                          placeholder="Search employee by name, email..."
                          value={dropdownSearch}
                          onChange={(e) => setDropdownSearch(e.target.value)}
                          className="pl-8.5 pr-8 h-9 text-xs bg-zinc-950 border-zinc-700/60 rounded-lg text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-purple-500"
                          autoFocus
                        />
                        {dropdownSearch && (
                          <button
                            type="button"
                            onClick={() => setDropdownSearch('')}
                            className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-xs text-zinc-400 hover:text-white"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-2 px-1 text-[11px] text-zinc-400">
                        <span>{filteredEmployeesList.length} employees available</span>
                        <span className="text-zinc-500 capitalize">{statusTab}</span>
                      </div>
                    </div>

                    {/* Scrollable Employees List */}
                    <div className="max-h-72 overflow-y-auto p-1.5 space-y-1">
                      {filteredEmployeesList.length === 0 ? (
                        <div className="py-8 text-center text-xs text-zinc-500">
                          {dropdownSearch ? `No employees match "${dropdownSearch}"` : 'No employees available'}
                        </div>
                      ) : (
                        filteredEmployeesList.map((emp) => {
                          const empId = String(emp.employeeId || emp._id);
                          const currentId = String(activeEmployeeObj?._id || activeEmployeeObj?.employeeId || '');
                          const isSelected = empId === currentId;
                          const deptName = typeof emp.department === 'object' ? emp.department?.name : (emp.department || 'General');

                          return (
                            <button
                              key={empId}
                              type="button"
                              onClick={() => {
                                setSelectedEmp(emp);
                                fetchEmployeeMonthlyBreakdown(empId, emp);
                                setEmployeePickerOpen(false);
                              }}
                              className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-all ${
                                isSelected
                                  ? 'bg-purple-600/20 text-purple-200 border border-purple-500/30'
                                  : 'hover:bg-zinc-900 text-zinc-300 hover:text-white border border-transparent'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                                  isSelected
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-zinc-800 text-zinc-300'
                                }`}>
                                  {emp.name ? emp.name.charAt(0).toUpperCase() : 'U'}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-xs truncate text-zinc-100">{emp.name}</span>
                                    {emp.stillExist === 0 && (
                                      <Badge variant="outline" className="text-[9px] px-1 py-0 text-rose-400 border-rose-500/30 bg-rose-500/10">
                                        Exited
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-zinc-400 truncate flex items-center gap-1.5 mt-0.5">
                                    <span>{deptName}</span>
                                    {emp.email && (
                                      <>
                                        <span>•</span>
                                        <span className="truncate">{emp.email}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {isSelected && (
                                <Check className="h-4 w-4 text-purple-400 flex-shrink-0 ml-2" />
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </PopoverContent>
                </Popover>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => activeEmployeeObj && fetchEmployeeMonthlyBreakdown(activeEmployeeObj._id || activeEmployeeObj.employeeId)}
                  className="h-10 px-3.5 text-xs font-semibold flex items-center gap-1.5 rounded-xl flex-shrink-0 shadow-sm"
                  title="Reload monthly breakdown for this employee"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingEmpBreakdown ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 2. EMPLOYEE PROFILE HERO BANNER */}
          {activeEmployeeObj && (
            <Card className="bg-gradient-to-r from-purple-950/20 via-background to-background border border-purple-500/30 overflow-hidden shadow-lg">
              <div className="h-1.5 w-full bg-gradient-to-r from-purple-500 via-indigo-500 to-emerald-500" />
              <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center font-extrabold text-2xl text-white shadow-xl shadow-purple-950/50 flex-shrink-0">
                    {activeEmployeeObj.name ? activeEmployeeObj.name.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-2xl font-extrabold text-foreground">
                        {activeEmployeeObj.name}
                      </h2>
                      {activeEmployeeObj.stillExist === 0 ? (
                        <Badge className="bg-rose-500/20 text-rose-400 border border-rose-500/40 font-bold text-xs">
                          Exited Employee
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold text-xs flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Active Employee
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                      <span>{activeEmployeeObj.email}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Building className="h-3 w-3 text-primary" />
                        {activeEmployeeObj.department || 'General'}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        {activeEmployeeObj.branch || 'Mumbai Office'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Overall Efficiency</p>
                    <div className="mt-1">
                      {getEfficiencyBadge(verifiedEfficiency, activeEmployeeObj)}
                    </div>
                  </div>
                  <div className="h-10 w-px bg-border mx-2 hidden sm:block" />
                  <div className="text-right hidden sm:block">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Attendance</p>
                    <p className="text-base font-black text-foreground mt-0.5">
                      {verifiedWorkedDays} / {empMonthlyData.employee?.totalDaysInMonth ?? 30} Days
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 3. USER MONTHLY KPI SUMMARY CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card className="p-4 bg-gradient-to-br from-emerald-500/10 via-background to-background border-emerald-500/30">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Active Hours</p>
                <Clock className="h-4 w-4 text-emerald-400" />
              </div>
              <h3 className="text-2xl font-extrabold mt-1 text-emerald-500">
                {empMonthlyData.employee?.totalActiveHours || activeEmployeeObj?.totalActiveHours || '0h 0m'}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Total Month Work</p>
            </Card>

            <Card className="p-4 bg-gradient-to-br from-amber-500/10 via-background to-background border-amber-500/30">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Idle Time</p>
                <Clock3 className="h-4 w-4 text-amber-400" />
              </div>
              <h3 className="text-2xl font-extrabold mt-1 text-amber-500">
                {empMonthlyData.employee?.totalIdleHours || activeEmployeeObj?.totalIdleHours || '0h 0m'}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Total Month Idle</p>
            </Card>

            <Card className="p-4 bg-gradient-to-br from-blue-500/10 via-background to-background border-blue-500/30">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Avg Productivity</p>
                <TrendingUp className="h-4 w-4 text-blue-400" />
              </div>
              <h3 className="text-2xl font-extrabold mt-1 text-blue-500">
                {verifiedScore}%
              </h3>
              <Progress
                value={verifiedScore}
                className="h-1.5 mt-2 bg-muted"
              />
            </Card>

            <Card className="p-4 bg-gradient-to-br from-purple-500/10 via-background to-background border-purple-500/30">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Total Keystrokes</p>
                <Keyboard className="h-4 w-4 text-purple-400" />
              </div>
              <h3 className="text-2xl font-extrabold mt-1 text-purple-500">
                {(empMonthlyData.employee?.totalKeystrokes || activeEmployeeObj?.totalKeystrokes || 0).toLocaleString()}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Monthly Keystrokes</p>
            </Card>

            <Card className="p-4 bg-gradient-to-br from-indigo-500/10 via-background to-background border-indigo-500/30">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Mouse Score</p>
                <Mouse className="h-4 w-4 text-indigo-400" />
              </div>
              <h3 className="text-2xl font-extrabold mt-1 text-indigo-500">
                {empMonthlyData.employee?.avgMouseActivity ?? activeEmployeeObj?.avgMouseActivity ?? 0}%
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Avg Mouse Activity</p>
            </Card>

            <Card className="p-4 bg-gradient-to-br from-rose-500/10 via-background to-background border-rose-500/30">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Efficiency</p>
                <Zap className="h-4 w-4 text-rose-400" />
              </div>
              <div className="mt-2">
                {getEfficiencyBadge(verifiedEfficiency)}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">Monthly Rating</p>
            </Card>
          </div>

          {/* 4. DAY-BY-DAY MONTHLY ACTIVITY TREND CHART FOR THIS USER */}
          <Card className="border-border">
            <CardHeader className="pb-2 flex flex-row items-center justify-between border-b border-border">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-purple-500" />
                Day-by-Day Performance Trend ({activeEmployeeObj?.name || 'Employee'}) - {formatMonthTitle(selectedMonth)}
              </CardTitle>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-emerald-500 font-semibold">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Productivity %
                </span>
                <span className="flex items-center gap-1.5 text-blue-500 font-semibold">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  Active Hours
                </span>
              </div>
            </CardHeader>
            <CardContent className="h-72 pt-4">
              {loadingEmpBreakdown ? (
                <div className="h-full flex items-center justify-center text-muted-foreground animate-pulse text-sm">
                  Loading monthly trend chart for {activeEmployeeObj?.name}...
                </div>
              ) : empMonthlyData.dailyBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={empMonthlyData.dailyBreakdown}>
                    <defs>
                      <linearGradient id="userColorProd" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="userColorHours" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="day"
                      stroke="#888888"
                      fontSize={11}
                      tickFormatter={(val) => `Day ${val}`}
                    />
                    <YAxis stroke="#888888" fontSize={11} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-zinc-950/95 border border-zinc-800 p-3 rounded-xl shadow-2xl text-xs space-y-1 z-50">
                              <p className="font-extrabold text-white">
                                {data.date} ({data.dayOfWeek})
                              </p>
                              <div className="flex items-center justify-between gap-4 text-zinc-400">
                                <span>Status:</span>
                                <span className="font-bold text-white">{data.status}</span>
                              </div>
                              <div className="flex items-center justify-between gap-4 text-emerald-400">
                                <span>Productivity:</span>
                                <span className="font-bold">{data.productivityScore}%</span>
                              </div>
                              <div className="flex items-center justify-between gap-4 text-blue-400">
                                <span>Active Hours:</span>
                                <span className="font-bold">{data.activeHours}</span>
                              </div>
                              <div className="flex items-center justify-between gap-4 text-amber-400">
                                <span>Idle Time:</span>
                                <span className="font-bold">{data.idleTime}</span>
                              </div>
                              <div className="flex items-center justify-between gap-4 text-purple-400">
                                <span>Keystrokes:</span>
                                <span className="font-bold">{(data.keystrokes || 0).toLocaleString()}</span>
                              </div>
                              <div className="flex items-center justify-between gap-4 text-zinc-400 pt-1 border-t border-zinc-800">
                                <span>Primary App:</span>
                                <span className="font-semibold text-zinc-300 truncate max-w-[150px]">{data.topApp}</span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="productivityScore"
                      name="Productivity %"
                      stroke="#10b981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#userColorProd)"
                    />
                    <Area
                      type="monotone"
                      dataKey="activeSeconds"
                      name="Active Hours"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#userColorHours)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  No activity trend recorded for this user in {selectedMonth}.
                </div>
              )}
            </CardContent>
          </Card>

          {/* 5. COMPLETE DAY-BY-DAY MONTHLY PERFORMANCE TABLE FOR THIS USER */}
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-3 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-purple-500" />
                  Full Monthly Day-by-Day Breakdown ({activeEmployeeObj?.name})
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Detailed activity log for every date in {formatMonthTitle(selectedMonth)} (Days 1 to {empMonthlyData.dailyBreakdown.length || 30})
                </p>
              </div>

              {/* Day Filter Pills */}
              <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-xl border border-border">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDayFilter('all')}
                  className={`text-xs font-semibold h-7 px-2.5 rounded-lg ${
                    dayFilter === 'all' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  All Days ({empMonthlyData.dailyBreakdown.length})
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDayFilter('worked')}
                  className={`text-xs font-semibold h-7 px-2.5 rounded-lg ${
                    dayFilter === 'worked' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  Workdays Only
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDayFilter('weekend')}
                  className={`text-xs font-semibold h-7 px-2.5 rounded-lg ${
                    dayFilter === 'weekend' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  Weekends
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-0 overflow-x-auto">
              {loadingEmpBreakdown ? (
                <div className="p-12 text-center text-muted-foreground animate-pulse text-sm">
                  Loading {activeEmployeeObj?.name}'s monthly daily records...
                </div>
              ) : filteredDailyBreakdown.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground text-sm">
                  No records match the selected day filter.
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-xs font-semibold uppercase text-muted-foreground border-b border-border">
                    <tr>
                      <th className="p-3.5">Date & Day</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5">Active Hours</th>
                      <th className="p-3.5">Idle Time</th>
                      <th className="p-3.5">Productivity</th>
                      <th className="p-3.5">Keystrokes</th>
                      <th className="p-3.5">Mouse Score</th>
                      <th className="p-3.5">Top Application</th>
                      <th className="p-3.5 text-right">Efficiency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredDailyBreakdown.map((dayItem, idx) => (
                      <tr
                        key={idx}
                        className={`transition-colors ${
                          dayItem.status === 'Weekend'
                            ? 'bg-muted/10 opacity-70 hover:opacity-100 hover:bg-muted/20'
                            : 'hover:bg-muted/30'
                        }`}
                      >
                        <td className="p-3.5 font-semibold text-xs">
                          <div>
                            <span className="font-bold text-foreground">{dayItem.date}</span>
                            <span className="text-muted-foreground ml-1.5 font-medium">({dayItem.dayShort})</span>
                          </div>
                        </td>
                        <td className="p-3.5">
                          {getDayStatusBadge(dayItem.status, dayItem.activeSeconds)}
                        </td>
                        <td className="p-3.5 font-bold text-xs text-emerald-600 dark:text-emerald-400">
                          {dayItem.activeHours}
                        </td>
                        <td className="p-3.5 font-medium text-xs text-amber-600 dark:text-amber-400">
                          {dayItem.idleTime}
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-2">
                            <span className="w-8 font-bold text-xs">{dayItem.productivityScore}%</span>
                            <Progress
                              value={dayItem.productivityScore}
                              className="h-1.5 w-16 bg-muted"
                            />
                          </div>
                        </td>
                        <td className="p-3.5 text-xs font-medium">
                          {(dayItem.keystrokes || 0).toLocaleString()}
                        </td>
                        <td className="p-3.5 text-xs font-medium">
                          {dayItem.mouseActivity}%
                        </td>
                        <td className="p-3.5 text-xs">
                          <Badge variant="outline" className="text-[10px] font-normal border-border bg-muted/40">
                            <Laptop className="h-2.5 w-2.5 mr-1 text-muted-foreground" />
                            {dayItem.topApp || 'General Workspace'}
                          </Badge>
                        </td>
                        <td className="p-3.5 text-right">
                          {getEfficiencyBadge(dayItem.productivityEfficiency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* =========================================================================
          SECTION B: TEAM MONTHLY OVERVIEW
         ========================================================================= */}
      {subView === 'team' && (
        <div className="space-y-6">
          {/* Team Monthly KPI Summary Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            <Card className="p-4 bg-gradient-to-br from-emerald-500/5 to-background border-emerald-500/20">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Active Hours</p>
              <h3 className="text-xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                {teamMonthlyData.overallSummary.totalActiveHours || '0h 0m'}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Monthly Team Total</p>
            </Card>

            <Card className="p-4 bg-gradient-to-br from-amber-500/5 to-background border-amber-500/20">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Idle Hours</p>
              <h3 className="text-xl font-bold mt-1 text-amber-600 dark:text-amber-400">
                {teamMonthlyData.overallSummary.totalIdleHours || '0h 0m'}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Monthly Team Total</p>
            </Card>

            <Card className="p-4 bg-gradient-to-br from-blue-500/5 to-background border-blue-500/20">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Avg Productivity</p>
              <h3 className="text-xl font-bold mt-1 text-blue-600 dark:text-blue-400">
                {teamMonthlyData.overallSummary.avgProductivityScore || 0}%
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Team Average</p>
            </Card>

            <Card className="p-4 bg-gradient-to-br from-purple-500/5 to-background border-purple-500/20">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Keystrokes</p>
              <h3 className="text-xl font-bold mt-1 text-purple-600 dark:text-purple-400">
                {(teamMonthlyData.overallSummary.totalKeystrokes || 0).toLocaleString()}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Team Keystrokes</p>
            </Card>

            <Card className="p-4 bg-gradient-to-br from-indigo-500/5 to-background border-indigo-500/20">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Mouse Score</p>
              <h3 className="text-xl font-bold mt-1 text-indigo-600 dark:text-indigo-400">
                {teamMonthlyData.overallSummary.totalMouseActivity || 0}%
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Avg Mouse Activity</p>
            </Card>

            <Card className="p-4 bg-gradient-to-br from-primary/5 to-background border-primary/20">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Overall Efficiency</p>
              <div className="mt-1">
                {getEfficiencyBadge(teamMonthlyData.overallSummary.overallProductivityEfficiency)}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Monthly Grade</p>
            </Card>
          </div>

          {/* Day-by-Day Activity Breakdown Chart for Entire Team */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Day-by-Day Team Activity Breakdown ({formatMonthTitle(selectedMonth)})
              </CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              {loadingTeam ? (
                <div className="h-full flex items-center justify-center text-muted-foreground animate-pulse text-sm">
                  Loading monthly trend chart...
                </div>
              ) : teamMonthlyData.dayByDayBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={teamMonthlyData.dayByDayBreakdown}>
                    <defs>
                      <linearGradient id="colorProd" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="day" stroke="#888888" fontSize={12} tickFormatter={(val) => `Day ${val}`} />
                    <YAxis stroke="#888888" fontSize={12} />
                    <Tooltip />
                    <Area type="monotone" dataKey="avgProductivityScore" name="Avg Productivity %" stroke="#10b981" fillOpacity={1} fill="url(#colorProd)" />
                    <Area type="monotone" dataKey="activeHours" name="Active Hours" stroke="#3b82f6" fillOpacity={1} fill="url(#colorHours)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  No activity trend data recorded for this month.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Employee-Wise Monthly Performance Table */}
          <Card>
            <CardHeader className="pb-3 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Employee Performance Summary for {formatMonthTitle(selectedMonth)}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Showing {filteredEmployeesList.length} employees (Filtered by: {statusTab === 'active' ? 'Active Users Only' : statusTab === 'exited' ? 'Exited Users Only' : 'All Users'})
                </p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search employee in table..."
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  className="pl-8 h-8 text-xs bg-background"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {loadingTeam ? (
                <div className="p-8 text-center text-muted-foreground animate-pulse text-sm">
                  Loading employee monthly data...
                </div>
              ) : filteredEmployeesList.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No employee monthly performance records found for {statusTab} status.
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-xs font-semibold uppercase text-muted-foreground border-b border-border">
                    <tr>
                      <th className="p-4">Employee</th>
                      <th className="p-4">Department</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Total Active Hours</th>
                      <th className="p-4">Total Idle Hours</th>
                      <th className="p-4">Avg Productivity</th>
                      <th className="p-4">Total Keystrokes</th>
                      <th className="p-4">Mouse Score</th>
                      <th className="p-4">Efficiency</th>
                      <th className="p-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredEmployeesList.map((emp) => (
                      <tr key={emp.employeeId || emp._id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-4 font-medium">
                          <div>
                            <p className="font-bold text-foreground">{emp.name}</p>
                            <p className="text-xs text-muted-foreground">{emp.email}</p>
                          </div>
                        </td>
                        <td className="p-4 text-xs font-medium text-muted-foreground">
                          {emp.department || 'General'}
                        </td>
                        <td className="p-4">
                          {emp.stillExist === 0 ? (
                            <Badge variant="outline" className="text-[10px] text-rose-400 border-rose-500/30 bg-rose-500/10 font-bold px-2 py-0">
                              Exited
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10 font-bold px-2 py-0">
                              Active
                            </Badge>
                          )}
                        </td>
                        <td className="p-4 font-semibold text-emerald-600 dark:text-emerald-400">
                          {emp.totalActiveHours}
                        </td>
                        <td className="p-4 font-semibold text-amber-600 dark:text-amber-400">
                          {emp.totalIdleHours}
                        </td>
                        <td className="p-4 font-bold">
                          <div className="flex items-center gap-2">
                            <span className="w-8">{emp.avgProductivityScore}%</span>
                            <Progress value={emp.avgProductivityScore} className="h-1.5 w-16" />
                          </div>
                        </td>
                        <td className="p-4">
                          {(emp.totalKeystrokes || 0).toLocaleString()}
                        </td>
                        <td className="p-4">{emp.avgMouseActivity}%</td>
                        <td className="p-4">{getEfficiencyBadge(emp.productivityEfficiency, emp)}</td>
                        <td className="p-4 text-right">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => {
                              setSelectedEmp(emp);
                              setSubView('individual');
                            }}
                            className="text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-950/40"
                          >
                            <UserIcon className="h-3 w-3 mr-1" />
                            View Monthly View
                            <ChevronRight className="h-3.5 w-3.5 ml-1" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
