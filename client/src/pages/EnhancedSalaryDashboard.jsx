import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  Users, 
  TrendingUp, 
  Calendar, 
  Filter,
  Download,
  Upload,
  Home,
  Building,
  AlertCircle,
  CheckCircle,
  Clock,
  FileSpreadsheet,
  BarChart3
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Alert, AlertDescription } from '../components/ui/alert';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { formatEmployeeId } from '../lib/employeeId';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

const EnhancedSalaryDashboard = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    fetchDashboardData();
  }, [selectedYear, selectedMonth]);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/api/enhanced-salary/dashboard/${selectedYear}/${selectedMonth}`,
        {
          headers: { 'x-auth-token': token }
        }
      );

      if (response.data.success) {
        setDashboardData(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err.response?.data?.message || 'Failed to fetch salary data');
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setLoading(true);
    setError(null);
    setSuccess(null);
    setUploadProgress(0);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/enhanced-salary/upload-biometric`,
        formData,
        {
          headers: {
            'x-auth-token': token,
            'Content-Type': 'multipart/form-data'
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percentCompleted);
          }
        }
      );

      if (response.data.success) {
        setSuccess(`Successfully processed ${response.data.data.processedCount} records`);
        fetchDashboardData();
      }
    } catch (err) {
      console.error('Error uploading biometric data:', err);
      setError(err.response?.data?.message || 'Failed to upload biometric data');
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  const exportToExcel = () => {
    if (!dashboardData || !dashboardData.employees) return;

    const exportData = dashboardData.employees.map(emp => ({
      'Employee ID': emp.user.employeeId || formatEmployeeId(emp.user.email),
      'Name': emp.user.name,
      'Email': emp.user.email,
      'Department': emp.user.department,
      'Type': emp.user.tag,
      'Days Present': emp.summary.daysPresent,
      'Days Absent': emp.summary.daysAbsent,
      'WFH Days': emp.summary.wfhDays,
      'Office Days': emp.summary.officeDays,
      'Total Hours': emp.summary.totalHoursWorked,
      'Regular Hours': emp.summary.totalRegularHours,
      'Overtime Hours': emp.summary.totalOvertimeHours,
      'Average Hours/Day': emp.summary.averageHoursPerDay,
      'Total Salary': emp.totalSalary,
      'Status': emp.status,
      'Discrepancies': emp.discrepancyCount
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Salary Report');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(data, `salary-report-${selectedYear}-${selectedMonth}.xlsx`);
  };

  const getMonthName = (month) => {
    return new Date(2024, month - 1).toLocaleString('default', { month: 'long' });
  };

  if (loading && !dashboardData) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading salary data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full pb-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-5 sm:p-6 rounded-2xl border border-border/60 bg-card/70 shadow-sm">
          <div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight text-foreground">
              Enhanced Salary Management
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">
              Live attendance integration with WFH tracking and biometric data
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Month/Year Selector */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="px-3.5 py-2 border border-border/70 rounded-xl bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {getMonthName(i + 1)}
                </option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="px-3.5 py-2 border border-border/70 rounded-xl bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {Array.from({ length: 3 }, (_, i) => (
                <option key={2024 + i} value={2024 + i}>
                  {2024 + i}
                </option>
              ))}
            </select>

            {/* Biometric Upload */}
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleBiometricUpload}
                className="hidden"
              />
              <Button className="gradient-primary text-primary-foreground rounded-xl shadow-glow-primary hover:opacity-95">
                <Upload className="w-4 h-4 mr-2" />
                Upload Biometric
              </Button>
            </label>

            {/* Export Button */}
            <Button
              onClick={exportToExcel}
              variant="outline"
              disabled={!dashboardData}
              className="rounded-xl"
            >
              <Download className="w-4 h-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {/* Upload Progress */}
        {uploadProgress > 0 && uploadProgress < 100 && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full gradient-primary transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
                <span className="text-sm font-medium tabular-nums text-muted-foreground">{uploadProgress}%</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary Cards */}
        {dashboardData?.stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card interactive className="border-l-4 border-l-emerald-500">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Payroll</p>
                    <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
                      ${dashboardData.stats.totalSalary.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Avg: ${dashboardData.stats.averageSalary.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 bg-emerald-500/10 rounded-xl">
                    <DollarSign className="w-6 h-6 text-emerald-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card interactive className="border-l-4 border-l-blue-500">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Hours</p>
                    <p className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400 mt-1">
                      {dashboardData.stats.totalHours.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Avg: {dashboardData.stats.averageHours.toFixed(1)} hrs/employee
                    </p>
                  </div>
                  <div className="p-3 bg-blue-500/10 rounded-xl">
                    <Clock className="w-6 h-6 text-blue-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card interactive className="border-l-4 border-l-purple-500">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">WFH Days</p>
                    <p className="text-2xl font-bold tabular-nums text-purple-600 dark:text-purple-400 mt-1">
                      {dashboardData.stats.totalWFHDays}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Office: {dashboardData.stats.totalOfficeDays}
                    </p>
                  </div>
                  <div className="p-3 bg-purple-500/10 rounded-xl">
                    <Home className="w-6 h-6 text-purple-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card interactive className="border-l-4 border-l-amber-500">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Employees</p>
                    <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400 mt-1">
                      {dashboardData.stats.totalEmployees}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {dashboardData.stats.employeesNeedingReview} need review
                    </p>
                  </div>
                  <div className="p-3 bg-amber-500/10 rounded-xl">
                    <Users className="w-6 h-6 text-amber-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Employee Salary Table */}
        {dashboardData?.employees && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-primary" />
                Employee Salary Breakdown
              </CardTitle>
              <CardDescription>
                {getMonthName(selectedMonth)} {selectedYear} - {dashboardData.employees.length} employees
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Employee</th>
                      <th className="text-center p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Department</th>
                      <th className="text-center p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Present</th>
                      <th className="text-center p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">WFH</th>
                      <th className="text-center p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Office</th>
                      <th className="text-center p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hours</th>
                      <th className="text-center p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">OT</th>
                      <th className="text-right p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Salary</th>
                      <th className="text-center p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardData.employees.map((emp) => (
                      <tr key={emp.user.id} className="border-b border-border/50 hover:bg-muted/40 transition-colors">
                        <td className="p-3">
                          <div>
                            <p className="font-medium text-foreground">{emp.user.name}</p>
                            <p className="text-xs text-muted-foreground">{emp.user.email}</p>
                          </div>
                        </td>
                        <td className="text-center p-3">
                          <Badge variant="outline">{emp.user.department || 'N/A'}</Badge>
                        </td>
                        <td className="text-center p-3 font-medium tabular-nums">{emp.summary.daysPresent}</td>
                        <td className="text-center p-3 tabular-nums">
                          <div className="flex items-center justify-center gap-1">
                            <Home className="w-4 h-4 text-purple-500" />
                            {emp.summary.wfhDays}
                          </div>
                        </td>
                        <td className="text-center p-3 tabular-nums">
                          <div className="flex items-center justify-center gap-1">
                            <Building className="w-4 h-4 text-blue-500" />
                            {emp.summary.officeDays}
                          </div>
                        </td>
                        <td className="text-center p-3 font-medium tabular-nums">{emp.summary.totalHoursWorked.toFixed(1)}</td>
                        <td className="text-center p-3 text-amber-500 tabular-nums">{emp.summary.totalOvertimeHours.toFixed(1)}</td>
                        <td className="text-right p-3 font-bold tabular-nums text-emerald-500">${emp.totalSalary.toLocaleString()}</td>
                        <td className="text-center p-3">
                          {emp.status === 'needs_review' ? (
                            <Badge variant="destructive">Review</Badge>
                          ) : (
                            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">OK</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info Card */}
        <Card className="bg-primary/5 border-primary/25">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/15 rounded-xl shrink-0">
                <AlertCircle className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground mb-2">How It Works</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>✓ Automatically calculates working hours from live attendance records</li>
                  <li>✓ Integrates biometric data with 30-minute allowance for start/end times</li>
                  <li>✓ Tracks WFH vs Office days from AIM records</li>
                  <li>✓ Calculates overtime (hours beyond 8 per day) at 1.5x rate</li>
                  <li>✓ Flags discrepancies between biometric and manual check-ins</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EnhancedSalaryDashboard;
