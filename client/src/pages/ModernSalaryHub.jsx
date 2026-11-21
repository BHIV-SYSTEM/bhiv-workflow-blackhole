import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  PieChart,
  Calculator,
  CreditCard,
  Wallet,
  Building,
  UserCheck,
  Clock,
  Target,
  Award,
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  Zap,
  Star,
  ArrowUp,
  ArrowDown,
  Activity,
  Globe,
  Smartphone,
  Shield,
  Search,
  RefreshCw,
  FileText,
  TrendingDown,
  User
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { useAuth } from '../context/auth-context';
import api from '../lib/api';
import { toast } from 'react-hot-toast';

const ModernSalaryHub = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [salaryData, setSalaryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedEmployeeType, setSelectedEmployeeType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showSalaryAmounts, setShowSalaryAmounts] = useState(true);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  const isAdmin = user?.role === 'Admin';

  useEffect(() => {
    if (isAdmin) {
      fetchSalaryData();
    }
  }, [selectedMonth, selectedYear, selectedDepartment, selectedEmployeeType]);

  const fetchSalaryData = async () => {
    try {
      setLoading(true);
      // Mock data for demonstration
      const mockData = generateMockSalaryData();
      setSalaryData(mockData);
    } catch (error) {
      console.error('Error fetching salary data:', error);
      toast.error('Failed to fetch salary data');
    } finally {
      setLoading(false);
    }
  };

  const generateMockSalaryData = () => {
    const employees = [];
    const salaryCards = [];

    return {
      salaryCards,
      summary: {
        totalEmployees: 0,
        totalPayroll: 0,
        averageSalary: 0,
        averageAttendance: 0,
        totalBonuses: 0,
        totalDeductions: 0,
        highPerformers: 0,
        needsAttention: 0
      }
    };
  };

  const handleBulkCalculation = async () => {
    try {
      setCalculating(true);
      toast.success('Starting bulk salary calculation...');
      
      // Simulate calculation process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await fetchSalaryData();
      toast.success('Bulk salary calculation completed!');
    } catch (error) {
      console.error('Error in bulk calculation:', error);
      toast.error('Failed to calculate salaries');
    } finally {
      setCalculating(false);
    }
  };

  const handleExportData = () => {
    toast.success('Exporting salary data...');
    // Implementation for data export
  };

  const filteredSalaryCards = salaryData?.salaryCards?.filter(card => {
    const matchesSearch = card.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         card.user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDepartment = selectedDepartment === 'all' || card.user.department === selectedDepartment;
    const matchesType = selectedEmployeeType === 'all' || card.user.type === selectedEmployeeType;
    
    return matchesSearch && matchesDepartment && matchesType;
  }) || [];

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
        <div className="max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl p-8 text-center shadow-2xl border border-gray-200"
          >
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Shield className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Access Restricted</h2>
            <p className="text-gray-600 mb-6">
              You need administrator privileges to access the salary management hub.
            </p>
            <Button 
              onClick={() => window.history.back()}
              className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
            >
              Go Back
            </Button>
          </motion.div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="relative">
            <div className="w-20 h-20 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Calculator className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          <p className="text-gray-700 mt-4 text-lg font-medium">Loading salary hub...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6"
        >
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
              Salary Management Hub
            </h1>
            <p className="text-gray-600 mt-2 text-lg">
              Comprehensive salary analytics and management system
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Button
              onClick={handleBulkCalculation}
              disabled={calculating}
              className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg"
            >
              {calculating ? (
                <div className="flex items-center">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                  Calculating...
                </div>
              ) : (
                <div className="flex items-center">
                  <Calculator className="w-4 h-4 mr-2" />
                  Calculate All
                </div>
              )}
            </Button>

            <Button
              onClick={() => setShowSalaryAmounts(!showSalaryAmounts)}
              variant="outline"
              className="border-gray-300 hover:bg-gray-50"
            >
              {showSalaryAmounts ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
              {showSalaryAmounts ? 'Hide' : 'Show'} Amounts
            </Button>

            <Button
              onClick={handleExportData}
              className="bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 shadow-lg"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </motion.div>

        {/* Summary Cards */}
        {salaryData?.summary && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            <Card className="bg-white shadow-lg border-0 overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-green-500 to-emerald-600"></div>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Total Payroll</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {showSalaryAmounts ? `₹${salaryData.summary.totalPayroll.toLocaleString()}` : '••••••'}
                    </p>
                    <p className="text-green-600 text-xs mt-1 flex items-center">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      +12% from last month
                    </p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-2xl">
                    <DollarSign className="w-8 h-8 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-lg border-0 overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-blue-500 to-cyan-600"></div>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Employees</p>
                    <p className="text-3xl font-bold text-gray-900">{salaryData.summary.totalEmployees}</p>
                    <p className="text-blue-600 text-xs mt-1">Active employees</p>
                  </div>
                  <div className="p-3 bg-blue-100 rounded-2xl">
                    <Users className="w-8 h-8 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-lg border-0 overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-purple-500 to-pink-600"></div>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Average Salary</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {showSalaryAmounts ? `₹${Math.round(salaryData.summary.averageSalary).toLocaleString()}` : '••••••'}
                    </p>
                    <p className="text-purple-600 text-xs mt-1">Per employee</p>
                  </div>
                  <div className="p-3 bg-purple-100 rounded-2xl">
                    <Calculator className="w-8 h-8 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-lg border-0 overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-orange-500 to-red-600"></div>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Avg Attendance</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {Math.round(salaryData.summary.averageAttendance)}%
                    </p>
                    <p className="text-orange-600 text-xs mt-1">This month</p>
                  </div>
                  <div className="p-3 bg-orange-100 rounded-2xl">
                    <TrendingUp className="w-8 h-8 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Filters and Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200"
        >
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <Search className="w-5 h-5 text-gray-400" />
              <Input
                placeholder="Search employees..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <Select value={selectedMonth.toString()} onValueChange={(value) => setSelectedMonth(parseInt(value))}>
              <SelectTrigger className="w-40 border-gray-300">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent className="bg-white border-gray-200">
                {Array.from({ length: 12 }, (_, i) => (
                  <SelectItem key={i + 1} value={(i + 1).toString()}>
                    {new Date(2024, i).toLocaleString('default', { month: 'long' })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
              <SelectTrigger className="w-32 border-gray-300">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent className="bg-white border-gray-200">
                {[2024, 2025].map(year => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
              <SelectTrigger className="w-40 border-gray-300">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent className="bg-white border-gray-200">
                <SelectItem value="all">All Departments</SelectItem>
                <SelectItem value="Engineering">Engineering</SelectItem>
                <SelectItem value="Marketing">Marketing</SelectItem>
                <SelectItem value="HR">HR</SelectItem>
                <SelectItem value="Finance">Finance</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedEmployeeType} onValueChange={setSelectedEmployeeType}>
              <SelectTrigger className="w-32 border-gray-300">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent className="bg-white border-gray-200">
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Employee">Employee</SelectItem>
                <SelectItem value="Intern">Intern</SelectItem>
                <SelectItem value="Contractor">Contractor</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={() => fetchSalaryData()}
              variant="outline"
              size="sm"
              className="border-gray-300 hover:bg-gray-50"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </motion.div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-white shadow-lg border border-gray-200">
            <TabsTrigger value="overview" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
              <CreditCard className="w-4 h-4 mr-2" />
              Salary Cards
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
              <BarChart3 className="w-4 h-4 mr-2" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="performance" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
              <Award className="w-4 h-4 mr-2" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="reports" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
              <FileText className="w-4 h-4 mr-2" />
              Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {filteredSalaryCards.map((card, index) => (
                <motion.div
                  key={card.user.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.02 }}
                  className="group"
                >
                  <Card className="bg-white shadow-lg border-0 hover:shadow-xl transition-all duration-300 overflow-hidden">
                    <div className={`h-1 bg-gradient-to-r ${
                      card.performance.rating === 'Excellent' ? 'from-green-500 to-emerald-600' :
                      card.performance.rating === 'Good' ? 'from-blue-500 to-cyan-600' :
                      'from-orange-500 to-red-600'
                    }`}></div>
                    
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-r ${
                            card.performance.rating === 'Excellent' ? 'from-green-500 to-emerald-600' :
                            card.performance.rating === 'Good' ? 'from-blue-500 to-cyan-600' :
                            'from-orange-500 to-red-600'
                          }`}>
                            <span className="text-white font-bold text-lg">
                              {card.user.name.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <h3 className="text-gray-900 font-semibold">{card.user.name}</h3>
                            <p className="text-gray-500 text-sm">{card.user.department}</p>
                          </div>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={`
                            ${card.user.type === 'Employee' ? 'border-green-300 text-green-700 bg-green-50' : ''}
                            ${card.user.type === 'Intern' ? 'border-blue-300 text-blue-700 bg-blue-50' : ''}
                            ${card.user.type === 'Contractor' ? 'border-orange-300 text-orange-700 bg-orange-50' : ''}
                          `}
                        >
                          {card.user.type}
                        </Badge>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="space-y-4">
                      {/* Attendance Stats */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-3 bg-gray-50 rounded-xl border border-gray-200">
                          <p className="text-gray-600 text-xs font-medium">Attendance</p>
                          <p className="text-gray-900 font-bold text-lg">{card.attendance.attendanceRate}%</p>
                          <p className="text-gray-500 text-xs">{card.attendance.presentDays}/{card.attendance.workingDays} days</p>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-xl border border-gray-200">
                          <p className="text-gray-600 text-xs font-medium">Hours</p>
                          <p className="text-gray-900 font-bold text-lg">{card.attendance.totalHours}h</p>
                          <p className="text-gray-500 text-xs">+{card.attendance.overtimeHours}h OT</p>
                        </div>
                      </div>

                      {/* Salary Information */}
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600 text-sm">Gross Salary</span>
                          <span className="text-gray-900 font-semibold">
                            {showSalaryAmounts ? `₹${card.salary.grossSalary.toLocaleString()}` : '••••••'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600 text-sm">Bonuses</span>
                          <span className="text-green-600 font-semibold">
                            {showSalaryAmounts ? `+₹${card.salary.bonuses.toLocaleString()}` : '••••••'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600 text-sm">Deductions</span>
                          <span className="text-red-600 font-semibold">
                            {showSalaryAmounts ? `-₹${card.salary.deductions.toLocaleString()}` : '••••••'}
                          </span>
                        </div>
                        <div className="border-t border-gray-200 pt-3">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-900 font-medium">Net Salary</span>
                            <span className="text-gray-900 font-bold text-lg">
                              {showSalaryAmounts ? `₹${card.salary.netSalary.toLocaleString()}` : '••••••'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Performance Indicator */}
                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center space-x-2">
                          <Star className="w-4 h-4 text-yellow-500" />
                          <span className="text-gray-600 text-sm">Performance</span>
                        </div>
                        <Badge 
                          variant="outline"
                          className={`
                            ${card.performance.rating === 'Excellent' ? 'border-green-300 text-green-700 bg-green-50' : ''}
                            ${card.performance.rating === 'Good' ? 'border-blue-300 text-blue-700 bg-blue-50' : ''}
                            ${card.performance.rating === 'Average' ? 'border-orange-300 text-orange-700 bg-orange-50' : ''}
                          `}
                        >
                          {card.performance.rating}
                        </Badge>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex space-x-2 pt-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="flex-1 border-gray-300 hover:bg-gray-50"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View Details
                        </Button>
                        <Button 
                          size="sm" 
                          className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
                        >
                          <Settings className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-6"
            >
              <Card className="bg-white shadow-lg border-0">
                <CardHeader>
                  <CardTitle className="text-gray-900 flex items-center">
                    <BarChart3 className="w-5 h-5 mr-2 text-blue-600" />
                    Salary Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-center justify-center text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="text-center">
                      <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Salary distribution chart will be displayed here</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white shadow-lg border-0">
                <CardHeader>
                  <CardTitle className="text-gray-900 flex items-center">
                    <PieChart className="w-5 h-5 mr-2 text-purple-600" />
                    Department Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-center justify-center text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="text-center">
                      <PieChart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Department breakdown chart will be displayed here</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          <TabsContent value="performance" className="space-y-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="bg-white shadow-lg border-0">
                <CardHeader>
                  <CardTitle className="text-gray-900 flex items-center">
                    <Award className="w-5 h-5 mr-2 text-yellow-600" />
                    Performance Analytics
                  </CardTitle>
                  <CardDescription className="text-gray-600">
                    Employee performance metrics and insights
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-center justify-center text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="text-center">
                      <Award className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Performance analytics will be displayed here</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          <TabsContent value="reports" className="space-y-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="bg-white shadow-lg border-0">
                <CardHeader>
                  <CardTitle className="text-gray-900 flex items-center">
                    <FileText className="w-5 h-5 mr-2 text-green-600" />
                    Salary Reports
                  </CardTitle>
                  <CardDescription className="text-gray-600">
                    Generate and download comprehensive salary reports
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Button className="h-20 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 hover:bg-blue-100 text-blue-700 border">
                      <div className="text-center">
                        <Download className="w-6 h-6 mx-auto mb-1" />
                        <span className="text-sm">Monthly Report</span>
                      </div>
                    </Button>
                    <Button className="h-20 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200 hover:bg-purple-100 text-purple-700 border">
                      <div className="text-center">
                        <BarChart3 className="w-6 h-6 mx-auto mb-1" />
                        <span className="text-sm">Analytics Report</span>
                      </div>
                    </Button>
                    <Button className="h-20 bg-gradient-to-br from-green-50 to-green-100 border-green-200 hover:bg-green-100 text-green-700 border">
                      <div className="text-center">
                        <Users className="w-6 h-6 mx-auto mb-1" />
                        <span className="text-sm">Employee Report</span>
                      </div>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ModernSalaryHub;