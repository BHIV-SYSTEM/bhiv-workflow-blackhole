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
  Shield
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useAuth } from '../context/auth-context';
import api from '../lib/api';

const ModernSalaryDashboard = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [salaryData, setSalaryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedEmployeeType, setSelectedEmployeeType] = useState('all');
  const [showSalaryAmounts, setShowSalaryAmounts] = useState(true);

  // Check if user has admin access
  const isAdmin = user?.role === 'Admin';

  useEffect(() => {
    if (isAdmin) {
      fetchSalaryData();
    }
  }, [selectedMonth, selectedYear, selectedDepartment, selectedEmployeeType]);

  const fetchSalaryData = async () => {
    try {
      setLoading(true);
      // This would be your API call to fetch salary data
      // For now, using mock data
      const mockData = generateMockSalaryData();
      setSalaryData(mockData);
    } catch (error) {
      console.error('Error fetching salary data:', error);
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
        totalDeductions: 0
      }
    };
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
        <div className="max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 text-center border border-white/20"
          >
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Shield className="w-10 h-10 text-red-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">Access Restricted</h2>
            <p className="text-gray-300 mb-6">
              You need administrator privileges to access the salary management dashboard.
            </p>
            <Button 
              onClick={() => window.history.back()}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="relative">
            <div className="w-20 h-20 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Calculator className="w-8 h-8 text-purple-400" />
            </div>
          </div>
          <p className="text-white mt-4 text-lg">Loading salary dashboard...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6"
        >
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
              Salary Management Hub
            </h1>
            <p className="text-gray-300 mt-2 text-lg">
              Advanced salary analytics and management system
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Filters */}
            <Select value={selectedMonth.toString()} onValueChange={(value) => setSelectedMonth(parseInt(value))}>
              <SelectTrigger className="w-40 bg-white/10 border-white/20 text-white backdrop-blur-xl">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {Array.from({ length: 12 }, (_, i) => (
                  <SelectItem key={i + 1} value={(i + 1).toString()} className="text-white hover:bg-slate-700">
                    {new Date(2024, i).toLocaleString('default', { month: 'long' })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
              <SelectTrigger className="w-32 bg-white/10 border-white/20 text-white backdrop-blur-xl">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {[2024, 2025].map(year => (
                  <SelectItem key={year} value={year.toString()} className="text-white hover:bg-slate-700">
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
              <SelectTrigger className="w-40 bg-white/10 border-white/20 text-white backdrop-blur-xl">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all" className="text-white hover:bg-slate-700">All Departments</SelectItem>
                <SelectItem value="Engineering" className="text-white hover:bg-slate-700">Engineering</SelectItem>
                <SelectItem value="Marketing" className="text-white hover:bg-slate-700">Marketing</SelectItem>
                <SelectItem value="HR" className="text-white hover:bg-slate-700">HR</SelectItem>
                <SelectItem value="Finance" className="text-white hover:bg-slate-700">Finance</SelectItem>
              </SelectContent>
            </Select>

            {/* Action Buttons */}
            <Button
              onClick={() => setShowSalaryAmounts(!showSalaryAmounts)}
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10 backdrop-blur-xl"
            >
              {showSalaryAmounts ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
              {showSalaryAmounts ? 'Hide' : 'Show'} Amounts
            </Button>

            <Button className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
              <Download className="w-4 h-4 mr-2" />
              Export Data
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
            <Card className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-purple-500/30 backdrop-blur-xl">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-200 text-sm font-medium">Total Payroll</p>
                    <p className="text-3xl font-bold text-white">
                      {showSalaryAmounts ? `₹${salaryData.summary.totalPayroll.toLocaleString()}` : '••••••'}
                    </p>
                    <p className="text-purple-300 text-xs mt-1">+12% from last month</p>
                  </div>
                  <div className="p-3 bg-purple-500/30 rounded-2xl">
                    <DollarSign className="w-8 h-8 text-purple-300" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border-cyan-500/30 backdrop-blur-xl">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-cyan-200 text-sm font-medium">Employees</p>
                    <p className="text-3xl font-bold text-white">{salaryData.summary.totalEmployees}</p>
                    <p className="text-cyan-300 text-xs mt-1">Active employees</p>
                  </div>
                  <div className="p-3 bg-cyan-500/30 rounded-2xl">
                    <Users className="w-8 h-8 text-cyan-300" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-green-500/30 backdrop-blur-xl">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-200 text-sm font-medium">Average Salary</p>
                    <p className="text-3xl font-bold text-white">
                      {showSalaryAmounts ? `₹${Math.round(salaryData.summary.averageSalary).toLocaleString()}` : '••••••'}
                    </p>
                    <p className="text-green-300 text-xs mt-1">Per employee</p>
                  </div>
                  <div className="p-3 bg-green-500/30 rounded-2xl">
                    <Calculator className="w-8 h-8 text-green-300" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-500/20 to-red-500/20 border-orange-500/30 backdrop-blur-xl">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-orange-200 text-sm font-medium">Avg Attendance</p>
                    <p className="text-3xl font-bold text-white">
                      {Math.round(salaryData.summary.averageAttendance)}%
                    </p>
                    <p className="text-orange-300 text-xs mt-1">This month</p>
                  </div>
                  <div className="p-3 bg-orange-500/30 rounded-2xl">
                    <TrendingUp className="w-8 h-8 text-orange-300" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-white/10 backdrop-blur-xl border-white/20">
            <TabsTrigger value="overview" className="data-[state=active]:bg-purple-500/30 text-white">
              <CreditCard className="w-4 h-4 mr-2" />
              Salary Cards
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-purple-500/30 text-white">
              <BarChart3 className="w-4 h-4 mr-2" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="performance" className="data-[state=active]:bg-purple-500/30 text-white">
              <Award className="w-4 h-4 mr-2" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="reports" className="data-[state=active]:bg-purple-500/30 text-white">
              <PieChart className="w-4 h-4 mr-2" />
              Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {salaryData?.salaryCards?.map((card, index) => (
                <motion.div
                  key={card.user.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.02 }}
                  className="group"
                >
                  <Card className="bg-white/10 backdrop-blur-xl border-white/20 hover:border-purple-500/50 transition-all duration-300 overflow-hidden">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                            <span className="text-white font-bold text-lg">
                              {card.user.name.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <h3 className="text-white font-semibold">{card.user.name}</h3>
                            <p className="text-gray-300 text-sm">{card.user.department}</p>
                          </div>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={`
                            ${card.user.type === 'Employee' ? 'border-green-500/50 text-green-400' : ''}
                            ${card.user.type === 'Intern' ? 'border-blue-500/50 text-blue-400' : ''}
                            ${card.user.type === 'Contractor' ? 'border-orange-500/50 text-orange-400' : ''}
                          `}
                        >
                          {card.user.type}
                        </Badge>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="space-y-4">
                      {/* Attendance Stats */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-3 bg-white/5 rounded-xl">
                          <p className="text-gray-300 text-xs">Attendance</p>
                          <p className="text-white font-bold text-lg">{card.attendance.attendanceRate}%</p>
                          <p className="text-gray-400 text-xs">{card.attendance.presentDays}/{card.attendance.workingDays} days</p>
                        </div>
                        <div className="text-center p-3 bg-white/5 rounded-xl">
                          <p className="text-gray-300 text-xs">Hours</p>
                          <p className="text-white font-bold text-lg">{card.attendance.totalHours}h</p>
                          <p className="text-gray-400 text-xs">+{card.attendance.overtimeHours}h OT</p>
                        </div>
                      </div>

                      {/* Salary Information */}
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-300 text-sm">Gross Salary</span>
                          <span className="text-white font-semibold">
                            {showSalaryAmounts ? `₹${card.salary.grossSalary.toLocaleString()}` : '••••••'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-300 text-sm">Bonuses</span>
                          <span className="text-green-400 font-semibold">
                            {showSalaryAmounts ? `+₹${card.salary.bonuses.toLocaleString()}` : '••••••'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-300 text-sm">Deductions</span>
                          <span className="text-red-400 font-semibold">
                            {showSalaryAmounts ? `-₹${card.salary.deductions.toLocaleString()}` : '••••••'}
                          </span>
                        </div>
                        <div className="border-t border-white/10 pt-3">
                          <div className="flex justify-between items-center">
                            <span className="text-white font-medium">Net Salary</span>
                            <span className="text-white font-bold text-lg">
                              {showSalaryAmounts ? `₹${card.salary.netSalary.toLocaleString()}` : '••••••'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Performance Indicator */}
                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center space-x-2">
                          <Star className="w-4 h-4 text-yellow-400" />
                          <span className="text-gray-300 text-sm">Performance</span>
                        </div>
                        <Badge 
                          variant="outline"
                          className={`
                            ${card.performance.rating === 'Excellent' ? 'border-green-500/50 text-green-400' : ''}
                            ${card.performance.rating === 'Good' ? 'border-blue-500/50 text-blue-400' : ''}
                            ${card.performance.rating === 'Average' ? 'border-orange-500/50 text-orange-400' : ''}
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
                          className="flex-1 border-white/20 text-white hover:bg-white/10"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View Details
                        </Button>
                        <Button 
                          size="sm" 
                          className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
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
              <Card className="bg-white/10 backdrop-blur-xl border-white/20">
                <CardHeader>
                  <CardTitle className="text-white flex items-center">
                    <BarChart3 className="w-5 h-5 mr-2 text-purple-400" />
                    Salary Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-center justify-center text-gray-400">
                    <div className="text-center">
                      <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Salary distribution chart will be displayed here</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/10 backdrop-blur-xl border-white/20">
                <CardHeader>
                  <CardTitle className="text-white flex items-center">
                    <PieChart className="w-5 h-5 mr-2 text-cyan-400" />
                    Department Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-center justify-center text-gray-400">
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
              <Card className="bg-white/10 backdrop-blur-xl border-white/20">
                <CardHeader>
                  <CardTitle className="text-white flex items-center">
                    <Award className="w-5 h-5 mr-2 text-yellow-400" />
                    Performance Analytics
                  </CardTitle>
                  <CardDescription className="text-gray-300">
                    Employee performance metrics and insights
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-center justify-center text-gray-400">
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
              <Card className="bg-white/10 backdrop-blur-xl border-white/20">
                <CardHeader>
                  <CardTitle className="text-white flex items-center">
                    <FileText className="w-5 h-5 mr-2 text-green-400" />
                    Salary Reports
                  </CardTitle>
                  <CardDescription className="text-gray-300">
                    Generate and download comprehensive salary reports
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Button className="h-20 bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-purple-500/30 hover:bg-purple-500/30">
                      <div className="text-center">
                        <Download className="w-6 h-6 mx-auto mb-1" />
                        <span className="text-sm">Monthly Report</span>
                      </div>
                    </Button>
                    <Button className="h-20 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border-cyan-500/30 hover:bg-cyan-500/30">
                      <div className="text-center">
                        <BarChart3 className="w-6 h-6 mx-auto mb-1" />
                        <span className="text-sm">Analytics Report</span>
                      </div>
                    </Button>
                    <Button className="h-20 bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-green-500/30 hover:bg-green-500/30">
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

export default ModernSalaryDashboard;