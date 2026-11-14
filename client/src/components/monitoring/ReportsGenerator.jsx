import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import {
  FileText,
  Download,
  Calendar as CalendarIcon,
  TrendingUp,
  Activity,
  Clock,
  AlertTriangle,
  Camera,
  BarChart3,
  PieChart,
  FileSpreadsheet,
  Mail,
  User as UserIcon,
  Users,
  Building2,
  Search,
  Check,
  RefreshCw,
  Printer,
  ChevronRight,
  Filter,
  Layers
} from 'lucide-react';
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import axios from 'axios';
import { API_URL } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { formatEmployeeId } from '@/lib/employeeId';

export function ReportsGenerator({
  employee: propEmployee,
  employees = [],
  onSelectEmployee,
  searchQuery: parentSearchQuery = '',
  onSearchChange,
  departments = []
}) {
  // Mode Selection: 'individual' vs 'team'
  const [reportMode, setReportMode] = useState('individual');

  // Employee selection states
  const [internalEmployees, setInternalEmployees] = useState(employees);
  const [selectedEmp, setSelectedEmp] = useState(propEmployee || employees[0] || null);
  const [employeeSearch, setEmployeeSearch] = useState(parentSearchQuery || '');

  // Team report configuration & states
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [teamReportData, setTeamReportData] = useState(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamTableSearch, setTeamTableSearch] = useState('');

  // Date and report config
  const [reportData, setReportData] = useState(null);
  const [timeframePreset, setTimeframePreset] = useState('daily');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [reportType, setReportType] = useState('summary');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  // Sync incoming employees prop (strictly active users)
  useEffect(() => {
    if (employees && employees.length > 0) {
      const activeOnly = employees.filter(e => e.stillExist !== 0);
      setInternalEmployees(activeOnly);
      if (!selectedEmp && activeOnly.length > 0) {
        setSelectedEmp(activeOnly[0]);
      }
    } else {
      fetchFallbackEmployees();
    }
  }, [employees]);

  // Sync selected employee when propEmployee changes
  useEffect(() => {
    if (propEmployee && propEmployee.stillExist !== 0) {
      setSelectedEmp(propEmployee);
    } else if (!selectedEmp && internalEmployees.length > 0) {
      setSelectedEmp(internalEmployees[0]);
    }
  }, [propEmployee, internalEmployees]);

  // Synchronize employeeSearch with parentSearchQuery
  useEffect(() => {
    if (parentSearchQuery !== undefined && parentSearchQuery !== employeeSearch) {
      setEmployeeSearch(parentSearchQuery);
    }
  }, [parentSearchQuery]);

  // Fallback fetch if employees prop was not provided (strictly active users)
  const fetchFallbackEmployees = async () => {
    try {
      const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
      const branch = localStorage.getItem('selectedBranch') || localStorage.getItem('branch');
      const response = await axios.get(`${API_URL}/monitoring/team-summary?statusTab=active`, {
        headers: {
          'x-auth-token': token,
          Authorization: `Bearer ${token}`,
          ...(branch && branch !== 'all' ? { 'x-branch': branch } : {})
        }
      });
      if (response.data && response.data.employees) {
        const activeOnly = response.data.employees.filter(e => e.stillExist !== 0);
        setInternalEmployees(activeOnly);
        if (!selectedEmp && activeOnly.length > 0) {
          setSelectedEmp(activeOnly[0]);
        }
      }
    } catch (err) {
      console.warn('Fallback employee list fetch failed:', err);
    }
  };

  const activeEmployee = selectedEmp || propEmployee || internalEmployees[0];
  const empId = activeEmployee?._id || activeEmployee?.employeeId;

  // Re-generate individual report data
  useEffect(() => {
    if (reportMode === 'individual' && empId) {
      generateReport();
    }
  }, [empId, startDate, endDate, reportMode]);

  // Re-fetch team report data when team mode is active
  useEffect(() => {
    if (reportMode === 'team') {
      fetchTeamReport();
    }
  }, [reportMode, startDate, endDate, selectedDepartment, statusFilter]);

  const generateReport = async () => {
    if (!empId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
      const branch = localStorage.getItem('selectedBranch') || localStorage.getItem('branch');
      const startStr = format(startDate, 'yyyy-MM-dd');
      const endStr = format(endDate, 'yyyy-MM-dd');

      const response = await axios.get(
        `${API_URL}/monitoring/reports/${empId}?startDate=${startStr}&endDate=${endStr}`,
        {
          headers: {
            'x-auth-token': token,
            Authorization: `Bearer ${token}`,
            ...(branch && branch !== 'all' ? { 'x-branch': branch } : {})
          }
        }
      );

      if (response.data) {
        setReportData(response.data);
      }
    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: 'Error Fetching Report',
        description: 'Failed to retrieve telemetry report for selected employee.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamReport = async () => {
    setTeamLoading(true);
    try {
      const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
      const branch = localStorage.getItem('selectedBranch') || localStorage.getItem('branch');
      const startStr = format(startDate, 'yyyy-MM-dd');
      const endStr = format(endDate, 'yyyy-MM-dd');
      const deptParam = selectedDepartment && selectedDepartment !== 'all' ? `&department=${selectedDepartment}` : '';

      const response = await axios.get(
        `${API_URL}/monitoring/reports/team/summary?startDate=${startStr}&endDate=${endStr}${deptParam}`,
        {
          headers: {
            'x-auth-token': token,
            Authorization: `Bearer ${token}`,
            ...(branch && branch !== 'all' ? { 'x-branch': branch } : {})
          }
        }
      );

      if (response.data && response.data.success) {
        setTeamReportData(response.data);
      }
    } catch (err) {
      console.error('Error fetching team report summary:', err);
      toast({
        title: 'Error Fetching Team Report',
        description: 'Could not load consolidated team telemetry data.',
        variant: 'destructive'
      });
    } finally {
      setTeamLoading(false);
    }
  };

  const handleSelectEmployee = (emp) => {
    setSelectedEmp(emp);
    if (onSelectEmployee) {
      onSelectEmployee(emp);
    }
  };

  const handleSearchChange = (val) => {
    setEmployeeSearch(val);
    if (onSearchChange) {
      onSearchChange(val);
    }
  };

  const handleTimeframeModeChange = (mode) => {
    setTimeframePreset(mode);
    const now = new Date();
    if (mode === 'daily') {
      setStartDate(now);
      setEndDate(now);
    } else if (mode === 'weekly') {
      setStartDate(subDays(now, 7));
      setEndDate(now);
    } else if (mode === 'monthly') {
      setStartDate(startOfMonth(now));
      setEndDate(endOfMonth(now));
    }
  };

  const handleSelectDailyDate = (date) => {
    if (!date) return;
    setStartDate(date);
    setEndDate(date);
  };

  const setQuickDateRange = (range) => {
    const now = new Date();
    switch (range) {
      case 'today':
        setTimeframePreset('daily');
        setStartDate(now);
        setEndDate(now);
        break;
      case 'yesterday':
        setTimeframePreset('daily');
        const yesterday = subDays(now, 1);
        setStartDate(yesterday);
        setEndDate(yesterday);
        break;
      case 'week':
        setTimeframePreset('weekly');
        setStartDate(startOfWeek(now, { weekStartsOn: 1 }));
        setEndDate(endOfWeek(now, { weekStartsOn: 1 }));
        break;
      case 'month':
        setTimeframePreset('monthly');
        setStartDate(startOfMonth(now));
        setEndDate(endOfMonth(now));
        break;
      case 'last7days':
        setTimeframePreset('weekly');
        setStartDate(subDays(now, 7));
        setEndDate(now);
        break;
      case 'last30days':
        setTimeframePreset('monthly');
        setStartDate(subDays(now, 30));
        setEndDate(now);
        break;
    }
  };

  // Filtered employees for individual selection dropdown
  const filteredEmployees = useMemo(() => {
    if (!employeeSearch.trim()) return internalEmployees;
    const q = employeeSearch.toLowerCase().trim();
    return internalEmployees.filter(emp => {
      const name = (emp.name || '').toLowerCase();
      const email = (emp.email || '').toLowerCase();
      const dept = typeof emp.department === 'object' ? (emp.department?.name || '') : (emp.department || '');
      const empIdStr = (emp.employeeId || formatEmployeeId(emp.email) || '').toLowerCase();
      return name.includes(q) || email.includes(q) || dept.toLowerCase().includes(q) || empIdStr.includes(q);
    });
  }, [internalEmployees, employeeSearch]);

  // Filtered team members for Team Table
  const filteredTeamMembers = useMemo(() => {
    const list = teamReportData?.members || [];
    if (!teamTableSearch.trim()) return list;
    const q = teamTableSearch.toLowerCase().trim();
    return list.filter(m => {
      const name = (m.name || '').toLowerCase();
      const email = (m.email || '').toLowerCase();
      const dept = (m.department || '').toLowerCase();
      const empIdStr = (m.employeeId || formatEmployeeId(m.email) || '').toLowerCase();
      return name.includes(q) || email.includes(q) || dept.includes(q) || empIdStr.includes(q);
    });
  }, [teamReportData?.members, teamTableSearch]);

  // Calculate true average productivity based strictly on days where activities occurred
  const workedDaysList = useMemo(() => {
    return (reportData?.dailyMetrics || []).filter(d => (d.totalActivities > 0 || d.activeHours > 0) && d.avgProductivityScore > 0);
  }, [reportData?.dailyMetrics]);

  const avgProductivityWorkedDays = useMemo(() => {
    if (workedDaysList.length === 0) return 0;
    const sum = workedDaysList.reduce((acc, d) => acc + (d.avgProductivityScore || 0), 0);
    return Math.round(sum / workedDaysList.length);
  }, [workedDaysList]);

  // ==================== INDIVIDUAL EXPORTS ====================
  const exportToExcelCSV = async () => {
    if (!activeEmployee) {
      toast({ title: 'Select Employee', description: 'Please select an employee to generate report', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    try {
      const startStr = format(startDate, 'yyyy-MM-dd');
      const endStr = format(endDate, 'yyyy-MM-dd');
      const empName = activeEmployee.name || 'Employee';
      const deptName = typeof activeEmployee.department === 'object' ? (activeEmployee.department?.name || 'General') : (activeEmployee.department || 'General');

      let csv = '';
      csv += 'NIYANTRAN WORKFLOW - EMPLOYEE PERFORMANCE REPORT\n';
      csv += `Employee Name,${empName}\n`;
      csv += `Employee ID,${activeEmployee.employeeId || formatEmployeeId(activeEmployee.email)}\n`;
      csv += `Email,${activeEmployee.email || 'N/A'}\n`;
      csv += `Department,${deptName}\n`;
      csv += `Status,${activeEmployee.stillExist === 0 ? 'Exited' : 'Active'}\n`;
      csv += `Date Range,${startStr} to ${endStr}\n`;
      csv += `Report Type,${reportType.toUpperCase()}\n`;
      csv += `Generated On,${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}\n\n`;

      const totalActivities = reportData?.dailyMetrics?.reduce((sum, d) => sum + (d.totalActivities || 0), 0) || 0;
      const avgScore = avgProductivityWorkedDays;
      const totalScreenshots = reportData?.screenshots?.total || 0;
      const flaggedScreenshots = reportData?.screenshots?.flagged || 0;
      const totalAlerts = reportData?.alertStats?.reduce((sum, s) => sum + (s.totalCount || 0), 0) || 0;

      const empIdFormatted = activeEmployee.employeeId || formatEmployeeId(activeEmployee.email) || 'N/A';

      csv += 'EXECUTIVE KPI SUMMARY\n';
      csv += 'Employee ID,Employee Name,Total Activities,Average Productivity Score (%),Total Screenshots,Flagged Screenshots,Total Alerts Triggered\n';
      csv += `"${empIdFormatted}","${empName}",${totalActivities},${avgScore}%,${totalScreenshots},${flaggedScreenshots},${totalAlerts}\n\n`;

      csv += 'DAILY PERFORMANCE BREAKDOWN\n';
      csv += 'Emp ID,Date,AIM,Blocker,Achievement,Total Activities,Productivity Score (%),Active Hours,Total Keystrokes,Mouse Activity (%),Efficiency Rating\n';

      const cleanIndividualField = (txt) => {
        if (!txt || txt === '-') return '-';
        return String(txt).replace(/"/g, '""').replace(/[\r\n\t]+/g, ' ').trim();
      };

      if (reportData?.dailyMetrics && reportData.dailyMetrics.length > 0) {
        reportData.dailyMetrics.forEach(day => {
          let eff = 'Low Efficiency';
          if (day.avgProductivityScore >= 60) eff = 'High Efficiency';
          else if (day.avgProductivityScore >= 40) eff = 'Moderate Efficiency';

          const activeText = (day.totalActivities > 0 || day.activeSeconds > 0 || day.activeHours > 0)
            ? (day.activeHoursFormatted || `${day.activeHours}h`)
            : '-';
          const aim = cleanIndividualField(day.aim || day.aims || day.todayAim);
          const blocker = cleanIndividualField(day.blocker || day.blockers);
          const achievement = cleanIndividualField(day.achievement || day.achievements);
          csv += `"${empIdFormatted}","${day.date}","${aim}","${blocker}","${achievement}",${day.totalActivities > 0 ? day.totalActivities : '-'},"${day.totalActivities > 0 ? `${day.avgProductivityScore}%` : '-'}","${activeText}",${day.totalKeystroke > 0 ? day.totalKeystroke : '-'},"${day.totalActivities > 0 ? `${day.avgMouseActivity}%` : '-'}","${day.totalActivities > 0 ? eff : '-'}"\n`;
        });
      } else {
        csv += 'No daily activity logs recorded for this period\n';
      }

      if (reportData?.alertStats && reportData.alertStats.length > 0) {
        csv += '\nALERTS SUMMARY BY TYPE\n';
        csv += 'Alert Category,Occurrences\n';
        reportData.alertStats.forEach(stat => {
          csv += `"${stat._id}",${stat.totalCount}\n`;
        });
      }

      if (reportData?.screenshots?.byTrigger) {
        csv += '\nSCREENSHOT TRIGGER BREAKDOWN\n';
        csv += 'Trigger Type,Count\n';
        Object.entries(reportData.screenshots.byTrigger).forEach(([trigger, count]) => {
          csv += `"${trigger}",${count}\n`;
        });
      }

      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `niyantran_report_${empName.replace(/[^a-z0-9]/gi, '_')}_${startStr}_to_${endStr}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: 'Report Downloaded',
        description: `Exported Excel CSV report for ${empName} successfully.`
      });

      // Also trigger backend CSV export in background
      try {
        const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
        axios.post(`${API_URL}/monitoring/export/csv/${empId}`, {
          startDate: startStr,
          endDate: endStr
        }, {
          headers: { 'x-auth-token': token, Authorization: `Bearer ${token}` }
        }).catch(() => {});
      } catch (e) {}

    } catch (err) {
      console.error('Failed to export CSV report:', err);
      toast({ title: 'Export Failed', description: 'Could not export report as CSV', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const exportToPDF = async () => {
    if (!activeEmployee) {
      toast({ title: 'Select Employee', description: 'Please select an employee first', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    try {
      const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
      const startStr = format(startDate, 'yyyy-MM-dd');
      const endStr = format(endDate, 'yyyy-MM-dd');

      // Attempt server PDF generation
      try {
        const response = await axios.post(
          `${API_URL}/monitoring/report/pdf/${empId}`,
          { startDate: startStr, endDate: endStr },
          { headers: { 'x-auth-token': token, Authorization: `Bearer ${token}` } }
        );

        const filename = response.data?.report?.filename;
        if (filename) {
          // Direct Blob Download: Bypasses PWA Service Worker navigation interception and React Router
          const downloadEndpoint = `${API_URL}/monitoring/download/${filename}`;
          const fileRes = await axios.get(downloadEndpoint, {
            headers: { 'x-auth-token': token, Authorization: `Bearer ${token}` },
            responseType: 'blob'
          });

          const blob = new Blob([fileRes.data], { type: 'application/pdf' });
          const blobUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);

          toast({
            title: 'PDF Report Downloaded',
            description: `Exported ${filename} successfully.`
          });
          return;
        }
      } catch (srvErr) {
        console.warn('Server PDF service failed, falling back to print dialog:', srvErr.message);
      }

      // Print Dialog Fallback (Save as PDF)
      toast({
        title: 'Opening Print / PDF View',
        description: 'Choose "Save as PDF" in your print destination.'
      });
      window.print();
    } catch (err) {
      console.error('Failed to export PDF:', err);
      toast({ title: 'Export Failed', description: 'Failed to generate PDF', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  // ==================== TEAM EXPORTS ====================
  const exportTeamToPDF = async () => {
    setGenerating(true);
    try {
      const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
      const startStr = format(startDate, 'yyyy-MM-dd');
      const endStr = format(endDate, 'yyyy-MM-dd');

      const response = await axios.post(
        `${API_URL}/monitoring/report/team/pdf`,
        {
          startDate: startStr,
          endDate: endStr,
          department: selectedDepartment
        },
        { 
          headers: { 'x-auth-token': token, Authorization: `Bearer ${token}` },
          timeout: 60000 
        }
      );

      const filename = response.data?.report?.filename;
      if (filename) {
        const downloadEndpoint = `${API_URL}/monitoring/download/${filename}`;
        const fileRes = await axios.get(downloadEndpoint, {
          headers: { 'x-auth-token': token, Authorization: `Bearer ${token}` },
          responseType: 'blob',
          timeout: 60000
        });

        const blob = new Blob([fileRes.data], { type: 'application/pdf' });
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);

        toast({
          title: 'Team PDF Report Downloaded',
          description: `Consolidated report downloaded successfully.`
        });
        return;
      }
    } catch (err) {
      console.error('Failed to export team PDF:', err);
      const msg = err.response?.data?.error || err.message || 'Could not generate team PDF report';
      toast({ title: 'Export Failed', description: msg, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const exportTeamToCSV = async () => {
    setGenerating(true);
    try {
      const sDate = new Date(startDate);
      const eDate = new Date(endDate);
      const startStr = format(sDate, 'yyyy-MM-dd');
      const endStr = format(eDate, 'yyyy-MM-dd');
      const isSame = sDate.toDateString() === eDate.toDateString();
      const sDay = String(sDate.getDate()).padStart(2, '0');
      const sMonth = String(sDate.getMonth() + 1).padStart(2, '0');
      const eDay = String(eDate.getDate()).padStart(2, '0');
      const eMonth = String(eDate.getMonth() + 1).padStart(2, '0');
      const dateDisplay = isSame ? `${sDay}/${sMonth}` : `${sDay}/${sMonth} - ${eDay}/${eMonth}`;
      const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');

      let members = teamReportData?.members;

      // If members are not loaded in client state yet, request generated CSV directly from backend
      if (!members || members.length === 0) {
        const res = await axios.post(
          `${API_URL}/monitoring/export/csv/team`,
          {
            startDate: startStr,
            endDate: endStr,
            department: selectedDepartment
          },
          {
            headers: { 'x-auth-token': token, Authorization: `Bearer ${token}` },
            timeout: 60000
          }
        );

        const filename = res.data?.export?.filename;
        if (filename) {
          const downloadEndpoint = `${API_URL}/monitoring/download/${filename}`;
          const fileRes = await axios.get(downloadEndpoint, {
            headers: { 'x-auth-token': token, Authorization: `Bearer ${token}` },
            responseType: 'blob',
            timeout: 60000
          });

          const blob = new Blob([fileRes.data], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

          toast({
            title: 'Team CSV Exported',
            description: `Exported consolidated team data successfully.`
          });
          return;
        }
      }

      // Exact columns matching specification with Employee ID, AIM, Blocker, Achievement:
      // Emp ID,Name,Date,AIM,Blocker,Achievement,Activities,Productivity,Active Hour,Key Strokes,Mouse Score,Efficiency
      let csv = 'Emp ID,Name,Date,AIM,Blocker,Achievement,Activities,Productivity,Active Hour,Key Strokes,Mouse Score,Efficiency\n';

      const cleanTeamField = (txt) => {
        if (!txt || txt === '-') return '-';
        return String(txt).replace(/"/g, '""').replace(/[\r\n\t]+/g, ' ').trim();
      };

      (members || []).forEach(m => {
        const empId = (m.employeeId || formatEmployeeId(m.email) || 'N/A').replace(/"/g, '""');
        const name = (m.name || 'Employee').replace(/"/g, '""');
        const aim = cleanTeamField(m.aim || m.aims);
        const blocker = cleanTeamField(m.blocker || m.blockers);
        const achievement = cleanTeamField(m.achievement || m.achievements);
        const acts = m.totalActivities > 0 ? m.totalActivities : '-';
        const prod = m.totalActivities > 0 ? `${m.avgProductivity}%` : '-';
        const hours = (m.totalActivities > 0 || m.activeSeconds > 0) ? (m.activeHoursFormatted || `${m.activeHours}h`) : '-';
        const keys = m.totalKeystrokes > 0 ? m.totalKeystrokes : '-';
        const mouse = m.totalActivities > 0 ? `${m.avgMouse}%` : '-';
        const eff = m.efficiency === 'No Activity' ? '-' : m.efficiency;
        csv += `"${empId}","${name}","${dateDisplay}","${aim}","${blocker}","${achievement}",${acts},"${prod}","${hours}","${keys}","${mouse}","${eff}"\n`;
      });

      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const fileDateSuffix = isSame ? `${startStr}` : `${startStr}_to_${endStr}`;
      link.download = `niyantran_team_report_${fileDateSuffix}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: 'Team CSV Exported',
        description: `Exported consolidated team data for ${(members || []).length} members.`
      });

      // Background server CSV trigger
      try {
        axios.post(`${API_URL}/monitoring/export/csv/team`, {
          startDate: startStr,
          endDate: endStr,
          department: selectedDepartment
        }, { headers: { 'x-auth-token': token, Authorization: `Bearer ${token}` } }).catch(() => {});
      } catch (e) {}

    } catch (err) {
      console.error('Failed to export team CSV:', err);
      const msg = err.response?.data?.error || err.message || 'Could not generate team CSV';
      toast({ title: 'Export Failed', description: msg, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const getProductivityColor = (score) => {
    if (score >= 60) return 'text-emerald-500';
    if (score >= 40) return 'text-amber-500';
    return 'text-rose-500';
  };

  return (
    <div className="space-y-6">
      {/* =========================================================================
          MODE SELECTOR BAR (INDIVIDUAL VS TEAM ALL MEMBERS)
         ========================================================================= */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2 bg-card border border-border rounded-2xl shadow-sm">
        <div className="flex items-center gap-1.5 p-1 bg-muted/50 rounded-xl">
          <Button
            type="button"
            variant={reportMode === 'individual' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setReportMode('individual')}
            className={`flex items-center gap-2 rounded-lg text-xs font-bold transition-all ${
              reportMode === 'individual'
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <UserIcon className="h-4 w-4" />
            Individual Report
          </Button>

          <Button
            type="button"
            variant={reportMode === 'team' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setReportMode('team')}
            className={`flex items-center gap-2 rounded-lg text-xs font-bold transition-all ${
              reportMode === 'team'
                ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users className="h-4 w-4" />
            Team / All Members Report
          </Button>
        </div>

        <div className="flex items-center gap-2 px-2 text-xs font-semibold text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
          {reportMode === 'individual'
            ? `Viewing: ${activeEmployee?.name || 'Selected Employee'}`
            : `Consolidated Scope: ${teamReportData?.totalEmployees || internalEmployees.length} Members`}
        </div>
      </div>

      {/* =========================================================================
          REPORT CONTROLS CARD
         ========================================================================= */}
      <Card className="border border-border shadow-sm bg-card">
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="flex items-center justify-between gap-2 text-base font-bold">
            <span className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {reportMode === 'individual'
                ? 'Individual Employee Performance Report'
                : 'All Members Consolidated Performance Report'}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={reportMode === 'individual' ? generateReport : fetchTeamReport}
              disabled={loading || teamLoading}
              className="text-xs h-8 flex items-center gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${(loading || teamLoading) ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          {/* =====================================================
              MODE 1: INDIVIDUAL EMPLOYEE SELECTOR & SEARCH
             ===================================================== */}
          {reportMode === 'individual' ? (
            <div className="p-4 rounded-2xl bg-muted/40 border border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-11 w-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center font-black text-primary text-lg shadow-inner flex-shrink-0">
                  {activeEmployee?.name ? activeEmployee.name.charAt(0).toUpperCase() : 'E'}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-extrabold text-base text-foreground truncate">
                      {activeEmployee?.name || 'Select An Employee'}
                    </h3>
                    <Badge variant="secondary" className="text-[10px] font-mono font-bold bg-muted text-foreground border border-border">
                      {activeEmployee?.employeeId || formatEmployeeId(activeEmployee?.email)}
                    </Badge>
                    {activeEmployee?.stillExist === 0 ? (
                      <Badge variant="outline" className="text-[10px] text-rose-400 border-rose-500/30 bg-rose-500/10">
                        Exited
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                        Active
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {activeEmployee?.email || 'Choose employee from selector'} • {typeof activeEmployee?.department === 'object' ? activeEmployee.department?.name : activeEmployee?.department || 'General'}
                  </p>
                </div>
              </div>

              {/* Searchable Employee Switcher */}
              <div className="w-full md:w-96 flex flex-col gap-1.5 flex-shrink-0">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span>Search & Switch Employee</span>
                  {employeeSearch && (
                    <button
                      onClick={() => handleSearchChange('')}
                      className="text-primary hover:underline lowercase font-normal"
                    >
                      clear search
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, department..."
                    value={employeeSearch}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-8 pr-8 h-9 text-xs bg-background rounded-xl border-border"
                  />
                  {employeeSearch && (
                    <button
                      onClick={() => handleSearchChange('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <Select
                  value={empId || ''}
                  onValueChange={(val) => {
                    const found = internalEmployees.find(e => (e._id || e.employeeId) === val);
                    if (found) handleSelectEmployee(found);
                  }}
                >
                  <SelectTrigger className="w-full h-9 bg-background border-border rounded-xl text-xs font-semibold">
                    <SelectValue placeholder="Choose from filtered list..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {filteredEmployees.length === 0 ? (
                      <div className="p-3 text-xs text-muted-foreground text-center">
                        No employees match "{employeeSearch}"
                      </div>
                    ) : (
                      filteredEmployees.map((emp) => (
                        <SelectItem key={emp._id || emp.employeeId} value={emp._id || emp.employeeId}>
                          <div className="flex items-center justify-between gap-3 w-full pr-2">
                            <span className="font-semibold text-xs">{emp.name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {emp.stillExist === 0 ? 'Exited' : (emp.department?.name || emp.department || 'Active')}
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            /* =====================================================
                MODE 2: TEAM SCOPE & DEPARTMENT FILTER CONTROLS
               ===================================================== */
            <div className="p-4 rounded-2xl bg-purple-500/5 border border-purple-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center font-black text-purple-600 text-lg shadow-inner flex-shrink-0">
                  <Users className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-foreground">
                    All Members Performance Report
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Consolidated telemetry across all staff in one unified report file
                  </p>
                </div>
              </div>

              {/* Department Filter for Team Report */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="w-48">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                    Department Scope
                  </label>
                  <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                    <SelectTrigger className="h-9 text-xs bg-background rounded-xl border-border">
                      <SelectValue placeholder="All Departments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Departments</SelectItem>
                      {departments.map((dept) => (
                        <SelectItem key={dept._id} value={dept._id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* TIMEFRAME & DATE CONTROLS (DAILY, WEEKLY, MONTHLY, CUSTOM) */}
          <div className="p-3.5 rounded-2xl bg-muted/30 border border-border space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-1.5 p-1 bg-background/80 border border-border rounded-xl">
                <Button
                  type="button"
                  variant={timeframePreset === 'daily' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handleTimeframeModeChange('daily')}
                  className={`text-xs h-7 px-3 rounded-lg font-bold transition-all ${
                    timeframePreset === 'daily'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Daily (Respected Date)
                </Button>
                <Button
                  type="button"
                  variant={timeframePreset === 'weekly' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handleTimeframeModeChange('weekly')}
                  className={`text-xs h-7 px-3 rounded-lg font-bold transition-all ${
                    timeframePreset === 'weekly'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Weekly
                </Button>
                <Button
                  type="button"
                  variant={timeframePreset === 'monthly' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handleTimeframeModeChange('monthly')}
                  className={`text-xs h-7 px-3 rounded-lg font-bold transition-all ${
                    timeframePreset === 'monthly'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Monthly
                </Button>
                <Button
                  type="button"
                  variant={timeframePreset === 'custom' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTimeframePreset('custom')}
                  className={`text-xs h-7 px-3 rounded-lg font-bold transition-all ${
                    timeframePreset === 'custom'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Custom
                </Button>
              </div>

              {/* Quick Preset Buttons according to active timeframe */}
              <div className="flex flex-wrap items-center gap-1.5">
                {timeframePreset === 'daily' && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQuickDateRange('today')}
                      className="text-xs h-7 px-2.5 rounded-lg bg-background border-border hover:bg-muted font-medium"
                    >
                      Today
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQuickDateRange('yesterday')}
                      className="text-xs h-7 px-2.5 rounded-lg bg-background border-border hover:bg-muted font-medium"
                    >
                      Yesterday
                    </Button>
                  </>
                )}
                {timeframePreset === 'weekly' && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQuickDateRange('last7days')}
                      className="text-xs h-7 px-2.5 rounded-lg bg-background border-border hover:bg-muted font-medium"
                    >
                      Last 7 Days
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQuickDateRange('week')}
                      className="text-xs h-7 px-2.5 rounded-lg bg-background border-border hover:bg-muted font-medium"
                    >
                      This Week
                    </Button>
                  </>
                )}
                {timeframePreset === 'monthly' && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQuickDateRange('last30days')}
                      className="text-xs h-7 px-2.5 rounded-lg bg-background border-border hover:bg-muted font-medium"
                    >
                      Last 30 Days
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQuickDateRange('month')}
                      className="text-xs h-7 px-2.5 rounded-lg bg-background border-border hover:bg-muted font-medium"
                    >
                      This Month
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Date Pickers */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {timeframePreset === 'daily' ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-foreground">Respected Date:</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-48 justify-start text-left font-bold text-xs h-9 rounded-xl bg-background border-border shadow-sm">
                        <CalendarIcon className="mr-2 h-3.5 w-3.5 text-primary" />
                        {format(startDate, 'dd/MM/yyyy')} ({format(startDate, 'EEE')})
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={handleSelectDailyDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <span className="text-[11px] text-muted-foreground">
                    (Click to change respected date)
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-foreground">Date Range:</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-36 justify-start text-left font-normal text-xs h-9 rounded-xl bg-background border-border">
                        <CalendarIcon className="mr-2 h-3.5 w-3.5 text-primary" />
                        {format(startDate, 'MMM dd, yyyy')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={(d) => d && setStartDate(d)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  <span className="text-xs text-muted-foreground font-semibold">to</span>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-36 justify-start text-left font-normal text-xs h-9 rounded-xl bg-background border-border">
                        <CalendarIcon className="mr-2 h-3.5 w-3.5 text-primary" />
                        {format(endDate, 'MMM dd, yyyy')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={(d) => d && setEndDate(d)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
          </div>

          {/* EXPORT BUTTONS BAR */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-foreground">Export:</span>

              {reportMode === 'individual' ? (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={exportToExcelCSV}
                    disabled={generating || loading || !activeEmployee}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 rounded-xl shadow-sm"
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-1.5" />
                    {generating ? 'Exporting...' : 'Download Excel (CSV)'}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportToPDF}
                    disabled={generating || loading || !activeEmployee}
                    className="font-bold text-xs h-9 rounded-xl"
                  >
                    <FileText className="h-4 w-4 mr-1.5 text-rose-500" />
                    Download PDF
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={exportTeamToCSV}
                    disabled={generating || teamLoading}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 rounded-xl shadow-sm"
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-1.5" />
                    {generating ? 'Exporting...' : 'Download Excel'}
                  </Button>

                  <Button
                    variant="default"
                    size="sm"
                    onClick={exportTeamToPDF}
                    disabled={generating || teamLoading}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-9 rounded-xl shadow-sm"
                  >
                    <FileText className="h-4 w-4 mr-1.5" />
                    {generating ? 'Generating PDF...' : 'Download PDF'}
                  </Button>
                </>
              )}
            </div>

            <div className="text-xs text-muted-foreground font-semibold flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                Active Users Only
              </Badge>
              <span>
                {format(startDate, 'yyyy-MM-dd') === format(endDate, 'yyyy-MM-dd')
                  ? `Date: ${format(startDate, 'dd/MM/yyyy')}`
                  : `Period: ${format(startDate, 'dd/MM/yyyy')} - ${format(endDate, 'dd/MM/yyyy')}`}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* =========================================================================
          VIEW MODE 1: INDIVIDUAL EMPLOYEE REPORT DETAILS
         ========================================================================= */}
      {reportMode === 'individual' ? (
        loading ? (
          <Card className="p-8 text-center bg-card border-border animate-pulse">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary mb-3" />
            <p className="text-sm font-semibold text-foreground">Generating telemetry report for {activeEmployee?.name}...</p>
            <p className="text-xs text-muted-foreground mt-1">Aggregating daily activities, keystrokes, and security alerts</p>
          </Card>
        ) : reportData ? (
          <>
            {/* Report Summary Cards */}
            <Card className="border-border shadow-sm bg-card">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="flex items-center justify-between gap-2 text-base font-bold">
                  <span className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    Report Summary: {activeEmployee?.name}
                  </span>
                  <Badge variant="outline" className="text-xs font-semibold border-primary/30 text-primary bg-primary/10">
                    {format(startDate, 'MMM dd')} - {format(endDate, 'MMM dd, yyyy')}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="text-center p-3 rounded-2xl bg-primary/5 border border-primary/10">
                    <Activity className="h-7 w-7 text-primary mx-auto mb-1.5" />
                    <p className="text-2xl font-black text-foreground">
                      {reportData.dailyMetrics?.reduce((sum, day) => sum + (day.totalActivities || 0), 0) || 0}
                    </p>
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">Total Activities</p>
                  </div>

                  <div className="text-center p-3 rounded-2xl bg-accent/5 border border-accent/10">
                    <TrendingUp className="h-7 w-7 text-accent mx-auto mb-1.5" />
                    <p className={`text-2xl font-black ${getProductivityColor(avgProductivityWorkedDays)}`}>
                      {avgProductivityWorkedDays}%
                    </p>
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">Avg Productivity</p>
                  </div>

                  <div className="text-center p-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
                    <Camera className="h-7 w-7 text-emerald-500 mx-auto mb-1.5" />
                    <p className="text-2xl font-black text-foreground">
                      {reportData.screenshots?.total || 0}
                    </p>
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">
                      Screenshots {reportData.screenshots?.flagged > 0 ? `(${reportData.screenshots.flagged} flagged)` : ''}
                    </p>
                  </div>

                  <div className="text-center p-3 rounded-2xl bg-rose-500/5 border border-rose-500/10">
                    <AlertTriangle className="h-7 w-7 text-rose-500 mx-auto mb-1.5" />
                    <p className="text-2xl font-black text-rose-500">
                      {reportData.alertStats?.reduce((sum, stat) => sum + (stat.totalCount || 0), 0) || 0}
                    </p>
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">Alerts Triggered</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Daily Performance Breakdown Table */}
            {reportData.dailyMetrics && reportData.dailyMetrics.length > 0 && (
              <Card className="border-border shadow-sm bg-card overflow-hidden">
                <CardHeader className="pb-3 border-b border-border">
                  <CardTitle className="flex items-center gap-2 text-base font-bold">
                    <CalendarIcon className="h-5 w-5 text-primary" />
                    Daily Performance Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase font-bold text-[11px]">
                      <tr>
                        <th className="p-3.5">Date</th>
                        <th className="p-3.5 text-center">Activities</th>
                        <th className="p-3.5 text-center">Productivity %</th>
                        <th className="p-3.5 text-center">Active Hours</th>
                        <th className="p-3.5 text-center">Keystrokes</th>
                        <th className="p-3.5 text-center">Mouse Activity</th>
                        <th className="p-3.5 text-right">Efficiency Rating</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {reportData.dailyMetrics.map((day) => {
                        let eff = 'Low Efficiency';
                        let effColor = 'text-rose-400 bg-rose-500/10 border-rose-500/30';
                        if (day.avgProductivityScore >= 60) {
                          eff = 'High Efficiency';
                          effColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
                        } else if (day.avgProductivityScore >= 40) {
                          eff = 'Moderate Efficiency';
                          effColor = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
                        }

                        return (
                          <tr key={day.date} className="hover:bg-muted/30 transition-colors">
                            <td className="p-3.5 font-bold text-foreground">{day.date}</td>
                            <td className="p-3.5 text-center text-muted-foreground font-semibold">{day.totalActivities}</td>
                            <td className={`p-3.5 text-center font-bold ${getProductivityColor(day.avgProductivityScore)}`}>
                              {day.avgProductivityScore}%
                            </td>
                            <td className="p-3.5 text-center text-foreground font-bold">{(day.totalActivities > 0 || day.activeSeconds > 0) ? (day.activeHoursFormatted || `${day.activeHours}h`) : '-'}</td>
                            <td className="p-3.5 text-center text-muted-foreground font-medium">
                              {(day.totalKeystroke || 0).toLocaleString()}
                            </td>
                            <td className="p-3.5 text-center text-muted-foreground font-medium">{day.avgMouseActivity || 0}%</td>
                            <td className="p-3.5 text-right">
                              <Badge variant="outline" className={`text-[10px] font-bold ${effColor}`}>
                                {eff}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <Card className="p-12 text-center bg-card border-border">
            <p className="text-sm text-muted-foreground">Select an employee and date range above to generate performance report.</p>
          </Card>
        )
      ) : (
        /* =========================================================================
            VIEW MODE 2: TEAM / ALL MEMBERS CONSOLIDATED REPORT
           ========================================================================= */
        teamLoading ? (
          <Card className="p-8 text-center bg-card border-border animate-pulse">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-purple-500 mb-3" />
            <p className="text-sm font-semibold text-foreground">Aggregating consolidated team performance report...</p>
            <p className="text-xs text-muted-foreground mt-1">Crunching activities, keystrokes, and metrics for all members</p>
          </Card>
        ) : teamReportData ? (
          <>
            {/* Team Executive KPI Cards */}
            <Card className="border-border shadow-sm bg-card">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="flex items-center justify-between gap-2 text-base font-bold">
                  <span className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-purple-500" />
                    Team Workforce Telemetry Overview
                  </span>
                  <Badge variant="outline" className="text-xs font-semibold border-purple-500/30 text-purple-400 bg-purple-500/10">
                    {teamReportData.totalEmployees} Roster Members • {teamReportData.activeMembersCount} Active
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="text-center p-3 rounded-2xl bg-purple-500/5 border border-purple-500/10">
                    <Users className="h-6 w-6 text-purple-500 mx-auto mb-1.5" />
                    <p className="text-2xl font-black text-foreground">
                      {teamReportData.totalEmployees}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">
                      Total Roster ({teamReportData.activeMembersCount} Active)
                    </p>
                  </div>

                  <div className="text-center p-3 rounded-2xl bg-primary/5 border border-primary/10">
                    <TrendingUp className="h-6 w-6 text-primary mx-auto mb-1.5" />
                    <p className={`text-2xl font-black ${getProductivityColor(teamReportData.teamSummary?.teamAvgProductivity || 0)}`}>
                      {teamReportData.teamSummary?.teamAvgProductivity || 0}%
                    </p>
                    <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">
                      Team Avg Productivity
                    </p>
                  </div>

                  <div className="text-center p-3 rounded-2xl bg-blue-500/5 border border-blue-500/10">
                    <Clock className="h-6 w-6 text-blue-500 mx-auto mb-1.5" />
                    <p className="text-2xl font-black text-foreground">
                      {teamReportData.teamSummary?.teamTotalHours || 0}h
                    </p>
                    <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">
                      Total Active Hours
                    </p>
                  </div>

                  <div className="text-center p-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
                    <Activity className="h-6 w-6 text-emerald-500 mx-auto mb-1.5" />
                    <p className="text-2xl font-black text-foreground">
                      {(teamReportData.teamSummary?.teamTotalKeystrokes || 0).toLocaleString()}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">
                      Total Keystrokes
                    </p>
                  </div>

                  <div className="text-center p-3 rounded-2xl bg-rose-500/5 border border-rose-500/10 col-span-2 md:col-span-1">
                    <AlertTriangle className="h-6 w-6 text-rose-500 mx-auto mb-1.5" />
                    <p className="text-2xl font-black text-rose-500">
                      {teamReportData.teamSummary?.teamTotalAlerts || 0}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">
                      Security Alerts
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* All Members Performance Roster Table */}
            <Card className="border-border shadow-sm bg-card overflow-hidden">
              <CardHeader className="pb-3 border-b border-border">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-base font-bold">
                    <Layers className="h-5 w-5 text-purple-500" />
                    All Members Performance Roster ({filteredTeamMembers.length})
                  </CardTitle>

                  {/* Search within team roster */}
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Filter roster by name, department..."
                      value={teamTableSearch}
                      onChange={(e) => setTeamTableSearch(e.target.value)}
                      className="pl-8 pr-8 h-8 text-xs bg-background rounded-xl border-border"
                    />
                    {teamTableSearch && (
                      <button
                        onClick={() => setTeamTableSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground font-bold"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase font-bold text-[11px]">
                    <tr>
                      <th className="p-3.5">Employee ID</th>
                      <th className="p-3.5">Name</th>
                      <th className="p-3.5 text-center">Date</th>
                      <th className="p-3.5">AIM</th>
                      <th className="p-3.5">Blocker</th>
                      <th className="p-3.5">Key Achievements</th>
                      <th className="p-3.5 text-center">Activities</th>
                      <th className="p-3.5 text-center">Productivity</th>
                      <th className="p-3.5 text-center">Active Hour</th>
                      <th className="p-3.5 text-center">Key Strokes</th>
                      <th className="p-3.5 text-center">Mouse Score</th>
                      <th className="p-3.5 text-center">Efficiency</th>
                      <th className="p-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredTeamMembers.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="p-8 text-center text-muted-foreground">
                          No active team members match "{teamTableSearch}"
                        </td>
                      </tr>
                    ) : (
                      filteredTeamMembers.map((m) => {
                        const sDate = new Date(startDate);
                        const eDate = new Date(endDate);
                        const isSame = sDate.toDateString() === eDate.toDateString();
                        const sDay = String(sDate.getDate()).padStart(2, '0');
                        const sMonth = String(sDate.getMonth() + 1).padStart(2, '0');
                        const eDay = String(eDate.getDate()).padStart(2, '0');
                        const eMonth = String(eDate.getMonth() + 1).padStart(2, '0');
                        const dateText = isSame ? `${sDay}/${sMonth}` : `${sDay}/${sMonth} - ${eDay}/${eMonth}`;
                        const empIdText = m.employeeId || formatEmployeeId(m.email);

                        return (
                          <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                            {/* 0. Employee ID */}
                            <td className="p-3.5 font-bold font-mono text-primary text-xs whitespace-nowrap">
                              {empIdText}
                            </td>

                            {/* 1. Name */}
                            <td className="p-3.5">
                              <div className="font-bold text-foreground">{m.name}</div>
                              <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                                {m.department || 'General'}
                              </div>
                            </td>

                            {/* 2. Date */}
                            <td className="p-3.5 text-center font-bold text-muted-foreground">
                              {dateText}
                            </td>

                            {/* 2a. AIM */}
                            <td className="p-3.5 text-xs text-foreground max-w-[200px]">
                              <div className="line-clamp-2" title={m.aim || '-'}>{m.aim || '-'}</div>
                            </td>

                            {/* 2b. Blocker */}
                            <td className="p-3.5 text-xs text-amber-400/90 max-w-[170px]">
                              <div className="line-clamp-2" title={m.blocker || '-'}>{m.blocker || '-'}</div>
                            </td>

                            {/* 2c. Key Achievements */}
                            <td className="p-3.5 text-xs text-emerald-400/90 max-w-[200px]">
                              <div className="line-clamp-2" title={m.achievement || '-'}>{m.achievement || '-'}</div>
                            </td>

                            {/* 3. Activities */}
                            <td className="p-3.5 text-center font-semibold text-foreground">
                              {m.totalActivities > 0 ? m.totalActivities : '-'}
                            </td>

                            {/* 4. Productivity */}
                            <td className={`p-3.5 text-center font-bold ${getProductivityColor(m.avgProductivity)}`}>
                              {m.totalActivities > 0 ? `${m.avgProductivity}%` : '-'}
                            </td>

                            {/* 5. Active Hour */}
                            <td className="p-3.5 text-center text-foreground font-bold">
                              {(m.totalActivities > 0 || m.activeSeconds > 0) ? (m.activeHoursFormatted || `${m.activeHours}h`) : '-'}
                            </td>

                            {/* 6. Key Strokes */}
                            <td className="p-3.5 text-center text-muted-foreground font-medium">
                              {m.totalKeystrokes > 0 ? m.totalKeystrokes.toLocaleString() : '-'}
                            </td>

                            {/* 7. Mouse Score */}
                            <td className="p-3.5 text-center text-muted-foreground font-medium">
                              {m.totalActivities > 0 ? `${m.avgMouse}%` : '-'}
                            </td>

                            {/* 8. Efficiency */}
                            <td className="p-3.5 text-center">
                              {m.totalActivities > 0 ? (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] font-bold ${
                                    m.efficiency === 'High Efficiency'
                                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                                      : m.efficiency === 'Moderate'
                                      ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                                      : m.efficiency === 'Low'
                                      ? 'text-rose-400 bg-rose-500/10 border-rose-500/30'
                                      : 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30'
                                  }`}
                                >
                                  {m.efficiency}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>

                            {/* Action */}
                            <td className="p-3.5 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const found = internalEmployees.find(e => (e._id || e.employeeId) === m.id);
                                  if (found) {
                                    handleSelectEmployee(found);
                                    setReportMode('individual');
                                  }
                                }}
                                className="text-[11px] h-7 px-2.5 text-primary hover:text-primary font-bold hover:bg-primary/10 rounded-lg"
                              >
                                View Report <ChevronRight className="h-3 w-3 ml-1" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Top Applications & Alerts Across Team */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Top Applications Across Team */}
              <Card className="border-border shadow-sm bg-card">
                <CardHeader className="pb-3 border-b border-border">
                  <CardTitle className="flex items-center gap-2 text-sm font-bold">
                    <Activity className="h-4 w-4 text-purple-500" />
                    Top Software & Workspace Usage
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  {Object.entries(teamReportData.teamApps || {}).length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No workspace application data recorded.</p>
                  ) : (
                    Object.entries(teamReportData.teamApps || {})
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 5)
                      .map(([app, count]) => {
                        const total = teamReportData.teamSummary?.teamTotalActivities || 1;
                        const pct = Math.round((count / total) * 100);
                        return (
                          <div key={app} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-foreground truncate max-w-[200px]">{app}</span>
                              <span className="text-muted-foreground">{count} sessions ({pct}%)</span>
                            </div>
                            <Progress value={pct} className="h-2 bg-muted rounded-full" />
                          </div>
                        );
                      })
                  )}
                </CardContent>
              </Card>

              {/* Team Security Alerts Breakdown */}
              <Card className="border-border shadow-sm bg-card">
                <CardHeader className="pb-3 border-b border-border">
                  <CardTitle className="flex items-center gap-2 text-sm font-bold">
                    <AlertTriangle className="h-4 w-4 text-rose-500" />
                    Team Security Alerts & Policy Warnings
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  {Object.entries(teamReportData.alertStats || {}).length === 0 ? (
                    <div className="p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-center">
                      <Check className="h-7 w-7 text-emerald-500 mx-auto mb-1.5" />
                      <p className="text-xs font-bold text-emerald-400">Zero Security Violations</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">No policy violations triggered across the team</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {Object.entries(teamReportData.alertStats || {}).map(([type, count]) => (
                        <div key={type} className="p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground capitalize">
                            {type.replace(/_/g, ' ')}
                          </span>
                          <Badge variant="outline" className="text-xs font-bold text-amber-400 border-amber-500/30 bg-amber-500/10">
                            {count} events
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <Card className="p-12 text-center bg-card border-border">
            <p className="text-sm text-muted-foreground">Select date range above to load consolidated team performance report.</p>
          </Card>
        )
      )}
    </div>
  );
}
