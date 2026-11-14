import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  DollarSign, 
  Users, 
  Calculator, 
  TrendingUp,
  TrendingDown,
  Calendar,
  Settings,
  Download,
  Upload,
  Filter,
  Search,
  Eye,
  Edit,
  Plus,
  AlertTriangle,
  CheckCircle,
  Clock,
  BarChart3,
  PieChart,
  FileText,
  Zap
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Progress } from '../ui/progress';
import { useAuth } from '../../context/auth-context';
import { useToast } from '../../hooks/use-toast';
import api from '../../lib/api';

const SalaryDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [salaryData, setSalaryData] = useState([]);
  const [stats, setStats] = useState({
    totalEmployees: 0,
    totalPayroll: 0,
    avgSalary: 0,
    pendingCalculations: 0,
    completedCalculations: 0,
    discrepancies: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [workingDays, setWorkingDays] = useState(22);
  const [calculating, setCalculating] = useState(false);

  // Fetch salary data
  const fetchSalaryData = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/salary/dashboard?month=${selectedMonth}&year=${selectedYear}`);
      if (response.data.success) {
        setSalaryData(response.data.salaryData);
        setStats(response.data.stats);
      }
    } catch (error) {
      console.error('Error fetching salary data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch salary data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Calculate salaries for all employees
  const calculateAllSalaries = async () => {
    try {
      setCalculating(true);
      const response = await api.post('/salary/calculate-bulk', {
        month: selectedMonth,
        year: selectedYear,
        workingDays
      });

      if (response.data.success) {
        toast({
          title: "Calculation Complete",
          description: `Calculated salaries for ${response.data.summary.successful} employees`,
          variant: "default"
        });
        
        // Refresh data
        await fetchSalaryData();
      }
    } catch (error) {
      console.error('Error calculating salaries:', error);
      toast({
        title: "Calculation Failed",
        description: error.response?.data?.error || "Failed to calculate salaries",
        variant: "destructive"
      });
    } finally {
      setCalculating(false);
    }
  };

  // Calculate salary for specific employee
  const calculateEmployeeSalary = async (employeeId) => {
    try {
      const response = await api.post(`/salary/calculate/${employeeId}`, {
        month: selectedMonth,
        year: selectedYear,
        workingDays
      });

      if (response.data.success) {
        toast({
          title: "Calculation Complete",
          description: `Salary calculated for ${response.data.calculation.user.name}`,
          variant: "default"
        });
        
        // Update the specific employee's data
        setSalaryData(prev => 
          prev.map(emp => 
            emp.user.id === employeeId 
              ? { ...emp, ...response.data.calculation }
              : emp
          )
        );
      }
    } catch (error) {
      console.error('Error calculating employee salary:', error);
      toast({
        title: "Calculation Failed",
        description: error.response?.data?.error || "Failed to calculate salary",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    fetchSalaryData();
  }, [selectedMonth, selectedYear]);

  // Filter salary data
  const filteredSalaryData = salaryData.filter(emp => {
    const matchesSearch = emp.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         emp.user.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDepartment = filterDepartment === 'all' || 
                             emp.user.department?.name === filterDepartment;
    
    const matchesStatus = filterStatus === 'all' || 
                         (filterStatus === 'calculated' && emp.salary) ||
                         (filterStatus === 'pending' && !emp.salary) ||
                         (filterStatus === 'discrepancy' && emp.recommendations?.some(r => r.severity === 'High'));
    
    return matchesSearch && matchesDepartment && matchesStatus;
  });

  const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount || 0);
  };

  const getStatusColor = (employee) => {
    if (!employee.salary) return 'bg-gray-500';
    if (employee.recommendations?.some(r => r.severity === 'High')) return 'bg-red-500';
    if (employee.recommendations?.some(r => r.severity === 'Medium')) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStatusText = (employee) => {
    if (!employee.salary) return 'Pending';
    if (employee.recommendations?.some(r => r.severity === 'High')) return 'Needs Review';
    if (employee.recommendations?.some(r => r.severity === 'Medium')) return 'Minor Issues';
    return 'Calculated';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center space-x-2">
          <Calculator className="w-6 h-6 animate-pulse text-blue-500" />
          <span className="text-lg">Loading salary data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Salary Management</h1>
          <p className="text-muted-foreground mt-1">
            Automated salary calculation and management system
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Select value={selectedMonth.toString()} onValueChange={(value) => setSelectedMonth(parseInt(value))}>
              <SelectTrigger className="w-32 bg-background/70 border-border/70">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border/70">
                {Array.from({ length: 12 }, (_, i) => (
                  <SelectItem key={i + 1} value={(i + 1).toString()}>
                    {new Date(0, i).toLocaleString('default', { month: 'long' })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
              <SelectTrigger className="w-24 bg-background/70 border-border/70">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border/70">
                {Array.from({ length: 5 }, (_, i) => (
                  <SelectItem key={2020 + i} value={(2020 + i).toString()}>
                    {2020 + i}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-muted-foreground">Working Days:</label>
            <Input
              type="number"
              value={workingDays}
              onChange={(e) => setWorkingDays(parseInt(e.target.value))}
              className="w-20 bg-background/70 border-border/70 tabular-nums"
              min="1"
              max="31"
            />
          </div>
          
          <Button 
            onClick={calculateAllSalaries}
            disabled={calculating}
            className="bg-gradient-to-r from-emerald-500 to-blue-600 hover:from-emerald-600 hover:to-blue-700 text-white shadow-sm"
          >
            {calculating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Calculating...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Calculate All
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card interactive className="border-border/70">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Employees</p>
                  <p className="text-2xl font-bold text-foreground tabular-nums">{stats.totalEmployees}</p>
                </div>
                <Users className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card interactive className="border-border/70">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Payroll</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(stats.totalPayroll)}</p>
                </div>
                <DollarSign className="w-8 h-8 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card interactive className="border-border/70">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Avg Salary</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">{formatCurrency(stats.avgSalary)}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card interactive className="border-border/70">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Calculated</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{stats.completedCalculations}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card interactive className="border-border/70">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 tabular-nums">{stats.pendingCalculations}</p>
                </div>
                <Clock className="w-8 h-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card interactive className="border-border/70">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Discrepancies</p>
                  <p className="text-2xl font-bold text-destructive tabular-nums">{stats.discrepancies}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Filters and Search */}
      <Card className="border-border/70">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search employees..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-background/70 border-border/70"
                />
              </div>
            </div>

            <Select value={filterDepartment} onValueChange={setFilterDepartment}>
              <SelectTrigger className="w-full lg:w-48 bg-background/70 border-border/70">
                <SelectValue placeholder="Filter by department" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border/70">
                <SelectItem value="all">All Departments</SelectItem>
                <SelectItem value="Engineering">Engineering</SelectItem>
                <SelectItem value="Marketing">Marketing</SelectItem>
                <SelectItem value="Sales">Sales</SelectItem>
                <SelectItem value="HR">HR</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full lg:w-48 bg-background/70 border-border/70">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border/70">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="calculated">Calculated</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="discrepancy">Needs Review</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 bg-muted/50 border border-border/60">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="employees" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Employee Salaries
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <PieChart className="w-4 h-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Salary Distribution */}
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-blue-500" />
                  Salary Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Calculated</span>
                    <span className="text-sm text-muted-foreground tabular-nums">{stats.completedCalculations}/{stats.totalEmployees}</span>
                  </div>
                  <Progress
                    value={stats.totalEmployees > 0 ? (stats.completedCalculations / stats.totalEmployees) * 100 : 0}
                    className="h-3"
                  />

                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="text-center p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                      <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{stats.completedCalculations}</div>
                      <div className="text-sm text-emerald-700 dark:text-emerald-300">Completed</div>
                    </div>
                    <div className="text-center p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                      <div className="text-2xl font-bold text-orange-600 dark:text-orange-400 tabular-nums">{stats.pendingCalculations}</div>
                      <div className="text-sm text-orange-700 dark:text-orange-300">Pending</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Calculations */}
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-emerald-500" />
                  Recent Calculations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
                  {filteredSalaryData
                    .filter(emp => emp.salary)
                    .sort((a, b) => new Date(b.calculatedAt) - new Date(a.calculatedAt))
                    .slice(0, 5)
                    .map((emp, index) => (
                      <motion.div
                        key={emp.user.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-center gap-3 p-2.5 bg-muted/40 border border-border/50 rounded-xl"
                      >
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={emp.user.avatar} />
                          <AvatarFallback className="bg-blue-500 text-white text-xs">
                            {emp.user.name.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {emp.user.name}
                          </p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {formatCurrency(emp.salary?.netPay)}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs border-border/70">
                          {getStatusText(emp)}
                        </Badge>
                      </motion.div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Employee Salaries Tab */}
        <TabsContent value="employees" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {filteredSalaryData.map((emp, index) => (
                <motion.div
                  key={emp.user.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{
                    scale: 1.02,
                    transition: { type: "spring", stiffness: 400, damping: 10 }
                  }}
                >
                  <Card interactive className="border-border/70">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <Avatar className="w-12 h-12">
                              <AvatarImage src={emp.user.avatar} />
                              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                                {emp.user.name.split(' ').map(n => n[0]).join('')}
                              </AvatarFallback>
                            </Avatar>
                            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-card ${getStatusColor(emp)}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-foreground truncate">
                              {emp.user.name}
                            </h3>
                            <p className="text-xs text-muted-foreground truncate">
                              {emp.user.email}
                            </p>
                            <Badge variant="outline" className="text-xs mt-1 border-border/70">
                              {emp.user.employeeType || 'Employee'}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => calculateEmployeeSalary(emp.user.id)}
                            className="text-blue-500 hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            <Calculator className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Status:</span>
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              emp.salary ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400'
                            }`}
                          >
                            {getStatusText(emp)}
                          </Badge>
                        </div>

                        {emp.salary && (
                          <>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Base Salary:</span>
                              <span className="font-medium text-foreground tabular-nums">
                                {formatCurrency(emp.salary.baseSalary)}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Net Pay:</span>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                                {formatCurrency(emp.salary.netPay)}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Attendance:</span>
                              <span className={`font-medium tabular-nums ${
                                emp.attendance?.attendanceRate >= 90 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                              }`}>
                                {emp.attendance?.attendanceRate || 0}%
                              </span>
                            </div>

                            {emp.workingHours && (
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Hours:</span>
                                <span className="font-medium text-foreground tabular-nums">
                                  {emp.workingHours.totalHours?.toFixed(1)}h
                                </span>
                              </div>
                            )}
                          </>
                        )}

                        {emp.recommendations && emp.recommendations.length > 0 && (
                          <div className="mt-3">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Issues ({emp.recommendations.length})</span>
                            </div>
                            <div className="space-y-1">
                              {emp.recommendations.slice(0, 2).map((rec, i) => (
                                <div key={i} className={`text-xs p-1.5 rounded border ${
                                  rec.severity === 'High' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                                  rec.severity === 'Medium' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' :
                                  'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                                }`}>
                                  {rec.message}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle>Payroll Trends</CardTitle>
                <CardDescription>Monthly payroll analysis</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Payroll analytics charts will be implemented here</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle>Department Breakdown</CardTitle>
                <CardDescription>Salary distribution by department</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <PieChart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Department analytics will be implemented here</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SalaryDashboard;
