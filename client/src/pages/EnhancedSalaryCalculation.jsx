import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calculator, 
  Users, 
  DollarSign, 
  TrendingUp,
  Calendar,
  Clock,
  Award,
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  Download,
  RefreshCw,
  Filter,
  Search,
  BarChart3,
  PieChart,
  Target,
  Zap,
  Star,
  ArrowUp,
  ArrowDown,
  Activity,
  Building,
  User,
  CreditCard,
  Wallet,
  TrendingDown
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
import { compareBySurname } from '../utils/nameSorting';

const EnhancedSalaryCalculation = () => {
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
      fetchSalaryCalculations();
    }
  }, [selectedMonth, selectedYear, selectedDepartment, selectedEmployeeType]);

  const fetchSalaryCalculations = async () => {
    try {
      setLoading(true);
      // Mock data for demonstration
      const mockData = generateMockSalaryCalculations();
      setSalaryData(mockData);
    } catch (error) {
      console.error('Error fetching salary calculations:', error);
      toast.error('Failed to fetch salary calculations');
    } finally {
      setLoading(false);
    }
  };

  const generateMockSalaryCalculations = () => {
    const employees = [];

    const calculations = employees.map(emp => {
      const workingDays = 26;
      const presentDays = Math.floor(Math.random() * 4) + 22;
      const totalHours = Math.floor(Math.random() * 40) + 180;
      const overtimeHours = Math.floor(Math.random() * 20);
      const baseSalary = emp.type === 'Intern' ? 15000 : emp.type === 'Contractor' ? 35000 : Math.floor(Math.random() * 30000) + 40000;
      const attendanceRate = (presentDays / workingDays) * 100;
      
      const bonuses = [];
      const deductions = [];
      
      // Perfect attendance bonus
      if (attendanceRate >= 100) {
        bonuses.push({ type: 'Perfect Attendance', amount: baseSalary * 0.05 });
      }
      
      // Overtime bonus
      if (overtimeHours > 15) {
        bonuses.push({ type: 'Overtime Excellence', amount: 500 });
      }
      
      // Late penalty
      if (attendanceRate < 90) {
        deductions.push({ type: 'Poor Attendance', amount: baseSalary * 0.05 });
      }
      
      // Tax deduction
      deductions.push({ type: 'Income Tax', amount: baseSalary * 0.1 });
      
      const totalBonuses = bonuses.reduce((sum, bonus) => sum + bonus.amount, 0);
      const totalDeductions = deductions.reduce((sum, deduction) => sum + deduction.amount, 0);
      const netSalary = baseSalary + totalBonuses - totalDeductions;
      
      const recommendations = [];
      if (attendanceRate < 90) {
        recommendations.push({
          type: 'Attendance',
          severity: 'High',
          message: `Attendance rate is ${attendanceRate.toFixed(1)}%. Needs improvement.`
        });
      }
      if (overtimeHours > 25) {
        recommendations.push({
          type: 'Work-Life Balance',
          severity: 'Medium',
          message: `Excessive overtime: ${overtimeHours} hours this month.`
        });
      }
      if (attendanceRate >= 98) {
        recommendations.push({
          type: 'Recognition',
          severity: 'Low',
          message: 'Excellent attendance record!'
        });
      }

      return {
        user: emp,
        period: {
          year: selectedYear,
          month: selectedMonth,
          monthName: new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long' }),
          workingDaysInMonth: workingDays
        },
        attendance: {
          workingDays,
          presentDays,
          absentDays: workingDays - presentDays,
          attendanceRate: Math.round(attendanceRate * 100) / 100,
          totalHours: Math.round(totalHours * 100) / 100,
          regularHours: Math.round((totalHours - overtimeHours) * 100) / 100,
          overtimeHours: Math.round(overtimeHours * 100) / 100,
          avgHoursPerDay: presentDays > 0 ? Math.round((totalHours / presentDays) * 100) / 100 : 0,
          hoursEfficiency: Math.round((totalHours / (workingDays * 8)) * 100 * 100) / 100
        },
        salary: {
          baseSalary,
          grossSalary: baseSalary + totalBonuses,
          netSalary: Math.round(netSalary * 100) / 100,
          dailyWage: Math.round((baseSalary / workingDays) * 100) / 100,
          hourlyRate: Math.round((baseSalary / (workingDays * 8)) * 100) / 100
        },
        adjustments: {
          bonuses,
          deductions,
          totalBonuses: Math.round(totalBonuses * 100) / 100,
          totalDeductions: Math.round(totalDeductions * 100) / 100
        },
        recommendations,
        performance: {
          score: Math.floor(Math.random() * 30) + 70,
          rating: attendanceRate >= 95 ? 'Excellent' : attendanceRate >= 85 ? 'Good' : 'Needs Improvement'
        },
        status: 'Calculated'
      };
    });

    const summary = {
      totalEmployees: calculations.length,
      successfulCalculations: calculations.length,
      totalPayroll: calculations.reduce((sum, calc) => sum + calc.salary.netSalary, 0),
      averageSalary: calculations.length > 0 ? calculations.reduce((sum, calc) => sum + calc.salary.netSalary, 0) / calculations.length : 0,
      averageAttendance: calculations.length > 0 ? calculations.reduce((sum, calc) => sum + calc.attendance.attendanceRate, 0) / calculations.length : 0,
      totalBonuses: calculations.reduce((sum, calc) => sum + calc.adjustments.totalBonuses, 0),
      totalDeductions: calculations.reduce((sum, calc) => sum + calc.adjustments.totalDeductions, 0),
      highPerformers: calculations.filter(calc => calc.attendance.attendanceRate >= 95).length,
      needsAttention: calculations.filter(calc => calc.recommendations.some(r => r.severity === 'High')).length
    };

    return { calculations, summary };
  };

  const handleBulkCalculation = async () => {
    try {
      setCalculating(true);
      toast.success('Starting bulk salary calculation...');
      
      // Simulate calculation process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await fetchSalaryCalculations();
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

  const filteredCalculations = salaryData?.calculations?.filter(calc => {
    const matchesSearch = calc.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         calc.user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDepartment = selectedDepartment === 'all' || calc.user.department === selectedDepartment;
    const matchesType = selectedEmployeeType === 'all' || calc.user.type === selectedEmployeeType;
    
    return matchesSearch && matchesDepartment && matchesType;
  }) || [];

  const sortedCalculations = [...filteredCalculations].sort((a, b) => {
    let aValue, bValue;
    
    switch (sortBy) {
      case 'name':
        return sortOrder === 'asc' ? compareBySurname(a.user, b.user) : compareBySurname(b.user, a.user);
      case 'salary':
        aValue = a.salary.netSalary;
        bValue = b.salary.netSalary;
        break;
      case 'attendance':
        aValue = a.attendance.attendanceRate;
        bValue = b.attendance.attendanceRate;
        break;
      case 'department':
        aValue = a.user.department;
        bValue = b.user.department;
        break;
      default:
        aValue = a.user.name;
        bValue = b.user.name;
    }
    
    if (typeof aValue === 'string') {
      return sortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    } else {
      return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    }
  });

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
              <AlertTriangle className="w-10 h-10 text-red-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">Access Restricted</h2>
            <p className="text-gray-300 mb-6">
              You need administrator privileges to access salary calculations.
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
          <p className="text-white mt-4 text-lg">Loading salary calculations...</p>
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
              Enhanced Salary Calculator
            </h1>
            <p className="text-gray-300 mt-2 text-lg">
              AI-powered salary calculations with attendance integration
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Button
              onClick={handleBulkCalculation}
              disabled={calculating}
              className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
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
              className="border-white/20 text-white hover:bg-white/10 backdrop-blur-xl"
            >
              {showSalaryAmounts ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
              {showSalaryAmounts ? 'Hide' : 'Show'} Amounts
            </Button>

            <Button
              onClick={handleExportData}
              className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
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
            <Card className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-purple-500/30 backdrop-blur-xl">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-200 text-sm font-medium">Total Payroll</p>
                    <p className="text-3xl font-bold text-white">
                      {showSalaryAmounts ? `₹${salaryData.summary.totalPayroll.toLocaleString()}` : '••••••'}
                    </p>
                    <p className="text-purple-300 text-xs mt-1">
                      {salaryData.summary.totalEmployees} employees
                    </p>
                  </div>
                  <div className="p-3 bg-purple-500/30 rounded-2xl">
                    <Wallet className="w-8 h-8 text-purple-300" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-green-500/30 backdrop-blur-xl">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-200 text-sm font-medium">Avg Salary</p>
                    <p className="text-3xl font-bold text-white">
                      {showSalaryAmounts ? `₹${Math.round(salaryData.summary.averageSalary).toLocaleString()}` : '••••••'}
                    </p>
                    <p className="text-green-300 text-xs mt-1">Per employee</p>
                  </div>
                  <div className="p-3 bg-green-500/30 rounded-2xl">
                    <TrendingUp className="w-8 h-8 text-green-300" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border-blue-500/30 backdrop-blur-xl">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-200 text-sm font-medium">Avg Attendance</p>
                    <p className="text-3xl font-bold text-white">
                      {Math.round(salaryData.summary.averageAttendance)}%
                    </p>
                    <p className="text-blue-300 text-xs mt-1">This month</p>
                  </div>
                  <div className="p-3 bg-blue-500/30 rounded-2xl">
                    <Activity className="w-8 h-8 text-blue-300" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-500/20 to-red-500/20 border-orange-500/30 backdrop-blur-xl">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-orange-200 text-sm font-medium">High Performers</p>
                    <p className="text-3xl font-bold text-white">
                      {salaryData.summary.highPerformers}
                    </p>
                    <p className="text-orange-300 text-xs mt-1">95%+ attendance</p>
                  </div>
                  <div className="p-3 bg-orange-500/30 rounded-2xl">
                    <Award className="w-8 h-8 text-orange-300" />
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
          className="flex flex-wrap items-center gap-4 bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20"
        >
          <div className="flex items-center space-x-2">
            <Search className="w-5 h-5 text-gray-300" />
            <Input
              placeholder="Search employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64 bg-white/10 border-white/20 text-white placeholder-gray-400"
            />
          </div>

          <Select value={selectedMonth.toString()} onValueChange={(value) => setSelectedMonth(parseInt(value))}>
            <SelectTrigger className="w-40 bg-white/10 border-white/20 text-white">
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

          <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
            <SelectTrigger className="w-40 bg-white/10 border-white/20 text-white">
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

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-32 bg-white/10 border-white/20 text-white">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="name" className="text-white hover:bg-slate-700">Name</SelectItem>
              <SelectItem value="salary" className="text-white hover:bg-slate-700">Salary</SelectItem>
              <SelectItem value="attendance" className="text-white hover:bg-slate-700">Attendance</SelectItem>
              <SelectItem value="department" className="text-white hover:bg-slate-700">Department</SelectItem>
            </SelectContent>
          </Select>

          <Button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            variant="outline"
            size="sm"
            className="border-white/20 text-white hover:bg-white/10"
          >
            {sortOrder === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
          </Button>
        </motion.div>

        {/* Salary Calculations Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6"
        >
          {sortedCalculations.map((calculation, index) => (
            <motion.div
              key={calculation.user.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ scale: 1.02 }}
              className="group"
            >
              <Card className="bg-white/10 backdrop-blur-xl border-white/20 hover:border-purple-500/50 transition-all duration-300 overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-lg">
                          {calculation.user.name.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-white font-semibold">{calculation.user.name}</h3>
                        <p className="text-gray-300 text-sm">{calculation.user.department}</p>
                      </div>
                    </div>
                    <Badge 
                      variant="outline" 
                      className={`
                        ${calculation.performance.rating === 'Excellent' ? 'border-green-500/50 text-green-400' : ''}
                        ${calculation.performance.rating === 'Good' ? 'border-blue-500/50 text-blue-400' : ''}
                        ${calculation.performance.rating === 'Needs Improvement' ? 'border-orange-500/50 text-orange-400' : ''}
                      `}
                    >
                      {calculation.performance.rating}
                    </Badge>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  {/* Attendance Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-2 bg-white/5 rounded-lg">
                      <p className="text-gray-300 text-xs">Attendance</p>
                      <p className="text-white font-bold">{calculation.attendance.attendanceRate}%</p>
                    </div>
                    <div className="text-center p-2 bg-white/5 rounded-lg">
                      <p className="text-gray-300 text-xs">Hours</p>
                      <p className="text-white font-bold">{calculation.attendance.totalHours}h</p>
                    </div>
                    <div className="text-center p-2 bg-white/5 rounded-lg">
                      <p className="text-gray-300 text-xs">Overtime</p>
                      <p className="text-white font-bold">{calculation.attendance.overtimeHours}h</p>
                    </div>
                  </div>

                  {/* Salary Breakdown */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300 text-sm">Base Salary</span>
                      <span className="text-white font-semibold">
                        {showSalaryAmounts ? `₹${calculation.salary.baseSalary.toLocaleString()}` : '••••••'}
                      </span>
                    </div>
                    
                    {calculation.adjustments.totalBonuses > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-300 text-sm">Bonuses</span>
                        <span className="text-green-400 font-semibold">
                          {showSalaryAmounts ? `+₹${calculation.adjustments.totalBonuses.toLocaleString()}` : '••••••'}
                        </span>
                      </div>
                    )}
                    
                    {calculation.adjustments.totalDeductions > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-300 text-sm">Deductions</span>
                        <span className="text-red-400 font-semibold">
                          {showSalaryAmounts ? `-₹${calculation.adjustments.totalDeductions.toLocaleString()}` : '••••••'}
                        </span>
                      </div>
                    )}
                    
                    <div className="border-t border-white/10 pt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-white font-medium">Net Salary</span>
                        <span className="text-white font-bold text-lg">
                          {showSalaryAmounts ? `₹${calculation.salary.netSalary.toLocaleString()}` : '••••••'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Recommendations */}
                  {calculation.recommendations.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-gray-300 text-sm font-medium">Recommendations:</p>
                      {calculation.recommendations.slice(0, 2).map((rec, idx) => (
                        <div key={idx} className="flex items-start space-x-2">
                          <div className={`w-2 h-2 rounded-full mt-2 ${
                            rec.severity === 'High' ? 'bg-red-400' :
                            rec.severity === 'Medium' ? 'bg-yellow-400' : 'bg-green-400'
                          }`}></div>
                          <p className="text-gray-300 text-xs">{rec.message}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex space-x-2 pt-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1 border-white/20 text-white hover:bg-white/10"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Details
                    </Button>
                    <Button 
                      size="sm" 
                      className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Slip
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* No Results */}
        {sortedCalculations.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <div className="w-20 h-20 bg-gray-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No Results Found</h3>
            <p className="text-gray-300">Try adjusting your search criteria or filters.</p>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default EnhancedSalaryCalculation;