import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  Users, 
  TrendingUp, 
  Calendar, 
  Filter,
  Download,
  Plus,
  Settings,
  BarChart3,
  Upload,
  Trash2,
  Edit2,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import salaryAPI from '../services/salaryAPI';
import { sortBySurname } from '../utils/nameSorting';

const SalaryManagement = () => {
  const [activeTab, setActiveTab] = useState('upload');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [salaryRecords, setSalaryRecords] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Holiday form state
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayDescription, setHolidayDescription] = useState('');
  const [holidayType, setHolidayType] = useState('public');
  
  // Initialize with current month
  useEffect(() => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(month);
  }, []);
  
  // Fetch data when month changes
  useEffect(() => {
    if (selectedMonth) {
      fetchSalaryRecords();
      fetchHolidays();
      fetchStats();
    }
  }, [selectedMonth]);

  // Fetch departments on mount
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        console.log('Fetching departments...');
        const response = await api.departments.getDepartments();
        console.log('Departments response:', response);
        if (response.success) {
          setDepartments(response.data);
          console.log('Departments set:', response.data);
        } else {
          console.log('Departments response not successful:', response);
          // Fallback to hardcoded departments
          setDepartments([
            { _id: '1', name: 'Engineering' },
            { _id: '2', name: 'Marketing' },
            { _id: '3', name: 'HR' },
            { _id: '4', name: 'Finance' }
          ]);
        }
      } catch (error) {
        console.error('Failed to fetch departments:', error);
        // Fallback to hardcoded departments
        setDepartments([
          { _id: '1', name: 'Engineering' },
          { _id: '2', name: 'Marketing' },
          { _id: '3', name: 'HR' },
          { _id: '4', name: 'Finance' }
        ]);
      }
    };

    fetchDepartments();
  }, []);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
        <div className="max-w-2xl mx-auto">
          <Card className="text-center p-8">
            <CardContent>
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <UserCheck className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Restricted</h2>
              <p className="text-gray-600">
                You need administrator privileges to access salary management.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const handleFilterChange = (key, value) => {
    updateFilters({ [key]: value });
  };

  const handleExport = () => {
    exportSalaryData('csv');
  };

  if (loading && !salaryData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-green-600 via-blue-600 to-purple-600 bg-clip-text text-transparent">
              Salary Management
            </h1>
            <p className="text-gray-600 mt-1">
              Comprehensive salary management and analytics
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Individual Salary Management Button */}
            <Button
              onClick={() => window.location.href = '/individual-salary-management'}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              <Users className="w-4 h-4 mr-2" />
              Manage Individual Salaries
            </Button>

            {/* Filters */}
            <Select value={filters.department || "all"} onValueChange={(value) => handleFilterChange('department', value === "all" ? "" : value)}>
              <SelectTrigger className="w-40 bg-white">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept._id} value={dept.name}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.tag || "all"} onValueChange={(value) => handleFilterChange('tag', value === "all" ? "" : value)}>
              <SelectTrigger className="w-32 bg-white">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Employee">Employee</SelectItem>
                <SelectItem value="Intern">Intern</SelectItem>
                <SelectItem value="Contractor">Contractor</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.month.toString()} onValueChange={(value) => handleFilterChange('month', parseInt(value))}>
              <SelectTrigger className="w-32 bg-white">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                {Array.from({ length: 12 }, (_, i) => (
                  <SelectItem key={i + 1} value={(i + 1).toString()}>
                    {new Date(2024, i).toLocaleString('default', { month: 'long' })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Action Buttons */}
            <Button
              onClick={() => setShowWorkingDaysConfig(true)}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Working Days
            </Button>

            <Button
              onClick={() => setShowSalaryForm(true)}
              variant="outline"
              size="sm"
              className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0 hover:from-blue-600 hover:to-blue-700"
            >
              <Plus className="w-4 h-4" />
              Add Salary
            </Button>

            <Button
              onClick={handleExport}
              disabled={!salaryData}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        {salaryData?.summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-emerald-50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-600">Total Payroll</p>
                    <p className="text-2xl font-bold text-green-900">
                      ${salaryData.summary.totalPayroll?.toLocaleString() || 0}
                    </p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-full">
                    <DollarSign className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-cyan-50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-600">Employees</p>
                    <p className="text-2xl font-bold text-blue-900">
                      {salaryData.summary.totalEmployees || 0}
                    </p>
                  </div>
                  <div className="p-3 bg-blue-100 rounded-full">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-violet-50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-purple-600">Average Salary</p>
                    <p className="text-2xl font-bold text-purple-900">
                      ${salaryData.summary.averageSalary?.toLocaleString() || 0}
                    </p>
                  </div>
                  <div className="p-3 bg-purple-100 rounded-full">
                    <Calculator className="w-6 h-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-orange-50 to-amber-50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-orange-600">Avg Attendance</p>
                    <p className="text-2xl font-bold text-orange-900">
                      {salaryData.summary.averageAttendance?.toFixed(1) || 0}%
                    </p>
                  </div>
                  <div className="p-3 bg-orange-100 rounded-full">
                    <TrendingUp className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:grid-cols-3">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Salary Cards
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center gap-2">
              <PieChart className="w-4 h-4" />
              Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {salaryData?.salaryCards && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sortBySurname(salaryData.salaryCards).map((card, index) => (
                  <div key={card.user.id}>
                    <SalaryCard
                      data={card}
                      onEdit={() => {
                        setSelectedEmployee(card.user);
                        setShowSalaryForm(true);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <SalaryAnalytics data={salaryData} />
          </TabsContent>

          <TabsContent value="reports" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Salary Reports</CardTitle>
                <CardDescription>
                  Detailed salary reports and insights
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  Salary reports coming soon...
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modals */}
        <SalaryForm
          isOpen={showSalaryForm}
          onClose={() => {
            setShowSalaryForm(false);
            setSelectedEmployee(null);
          }}
          employee={selectedEmployee}
          onSuccess={() => {
            refresh();
            setShowSalaryForm(false);
            setSelectedEmployee(null);
          }}
        />

        <WorkingDaysConfig
          isOpen={showWorkingDaysConfig}
          onClose={() => setShowWorkingDaysConfig(false)}
          onSuccess={() => {
            refresh();
            setShowWorkingDaysConfig(false);
          }}
        />
      </div>
    </div>
  );
};

export default SalaryManagement;
