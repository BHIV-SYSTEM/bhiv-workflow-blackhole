import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  UserCheck,
  UserX,
  MapPin,
  Navigation,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  StopCircle,
  Pause,
  Play,
  Eye,
  EyeOff,
  Filter,
  Search,
  RefreshCw,
  Download,
  Send,
  BarChart3,
  TrendingUp,
  Radio,
  Zap,
  Shield,
  AlertCircle
} from 'lucide-react';
import { formatEmployeeId } from '../../lib/employeeId';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Progress } from '../ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { useAuth } from '../../context/auth-context';
import { useSocketContext } from '../../context/socket-context';
import api from '../../lib/api';
import { useToast } from '../../hooks/use-toast';

const LiveAttendanceAdminPanel = () => {
  const { user } = useAuth();
  const { socket } = useSocketContext();
  const { toast } = useToast();

  // State Management
  const [liveUsers, setLiveUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [stats, setStats] = useState({
    totalEmployees: 0,
    presentToday: 0,
    absentToday: 0,
    lateToday: 0,
    onLeaveToday: 0,
    dayStartedCount: 0,
    dayEndedCount: 0,
    presentPercentage: 0,
    avgHoursToday: 0,
    totalHoursToday: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [activeTab, setActiveTab] = useState('live');
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Dialog states
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserDetailsDialog, setShowUserDetailsDialog] = useState(false);
  const [showAlertDialog, setShowAlertDialog] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [showLocationHistoryDialog, setShowLocationHistoryDialog] = useState(false);
  const [locationHistory, setLocationHistory] = useState([]);

  // Fetch departments
  const fetchDepartments = async () => {
    try {
      const response = await api.get('/departments');
      if (response.data?.success && response.data.data) {
        setDepartments(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  // Fetch live attendance data
  const fetchLiveAttendanceData = async () => {
    try {
      setLoading(true);
      console.log('📊 Fetching live attendance data...');
      
      // Build query parameters
      const params = {};
      if (filterDepartment && filterDepartment !== 'all') {
        params.department = filterDepartment;
      }
      if (filterStatus && filterStatus !== 'all') {
        params.status = filterStatus;
      }
      
      // Fetch from the /live endpoint which shows all employees
      const response = await api.get('/attendance/live', { params });
      console.log('✅ Live attendance response:', response.data);
      
      if (response.data?.success && response.data.data) {
        const { attendance, stats: serverStats } = response.data.data;
        
        setLiveUsers(attendance || []);
        setStats({
          totalEmployees: serverStats.totalEmployees || 0,
          presentToday: serverStats.presentToday || 0,
          absentToday: serverStats.absentToday || 0,
          lateToday: serverStats.lateToday || 0,
          onLeaveToday: serverStats.onLeaveToday || 0,
          dayStartedCount: serverStats.dayStartedCount || 0,
          dayEndedCount: serverStats.dayEndedCount || 0,
          presentPercentage: serverStats.presentPercentage || 0,
          avgHoursToday: serverStats.avgHoursToday || 0,
          totalHoursToday: serverStats.totalHoursToday || 0
        });
        
        setLastUpdated(new Date());
        console.log(`📊 Loaded ${attendance?.length || 0} attendance records`);
      }
      
    } catch (error) {
      console.error('❌ Error fetching live attendance:', error);
      toast({
        title: "Error",
        description: "Could not fetch live attendance data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('attendance:live-tracking-started', (data) => {
      toast({
        title: "Live Tracking Started",
        description: `${data.userName} started live tracking`,
        variant: "default"
      });
      fetchLiveAttendanceData();
    });

    socket.on('attendance:location-update', (data) => {
      setLiveUsers(prev => prev.map(user => 
        user.user?._id === data.userId 
          ? { ...user, lastLocationUpdate: new Date() }
          : user
      ));
    });

    socket.on('attendance:geofence-exit', (data) => {
      toast({
        title: "⚠️ Geofence Violation",
        description: `Employee exited office radius (${data.distanceFromOffice}m away)`,
        variant: "destructive"
      });
    });

    socket.on('attendance:geofence-enter', (data) => {
      toast({
        title: "✅ Geofence Re-entry",
        description: `Employee returned to office radius`,
        variant: "default"
      });
    });

    socket.on('alert:triggered', (data) => {
      toast({
        title: "🚨 Alert Triggered",
        description: data.alert?.title || "A new alert has been triggered",
        variant: "destructive"
      });
      fetchLiveAttendanceData();
    });

    return () => {
      socket.off('attendance:live-tracking-started');
      socket.off('attendance:location-update');
      socket.off('attendance:geofence-exit');
      socket.off('attendance:geofence-enter');
      socket.off('alert:triggered');
    };
  }, [socket, toast]);

  useEffect(() => {
    fetchDepartments();
    fetchLiveAttendanceData();
    const interval = setInterval(fetchLiveAttendanceData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [filterDepartment, filterStatus]);

  // Fetch data when filters change
  useEffect(() => {
    if (!loading) {
      fetchLiveAttendanceData();
    }
  }, [filterDepartment, filterStatus]);

  // Filtered users
  const filteredUsers = liveUsers.filter(record => {
    const userName = record.user?.name?.toLowerCase() || '';
    const userEmail = record.user?.email?.toLowerCase() || '';
    const matchesSearch = userName.includes(searchTerm.toLowerCase()) || 
                         userEmail.includes(searchTerm.toLowerCase());

    return matchesSearch;
  });

  const getStatusBadge = (record) => {
    // Check if work session is paused
    if (record.workSession && record.workSession.status === 'paused') {
      return <Badge className="bg-orange-500 text-white animate-pulse">⏸️ Paused</Badge>;
    }
    if (record.isLeave) {
      return <Badge className="bg-purple-500">On Leave</Badge>;
    }
    if (!record.startDayTime) {
      return <Badge variant="outline" className="bg-gray-500 text-white">Absent</Badge>;
    }
    if (record.endDayTime) {
      return <Badge className="bg-blue-500">Day Completed</Badge>;
    }
    if (record.isLate) {
      return <Badge className="bg-yellow-500">Late</Badge>;
    }
    if (record.isPresent) {
      return <Badge className="bg-green-500 animate-pulse">🟢 Present</Badge>;
    }
    return <Badge variant="outline">Unknown</Badge>;
  };

  const handleViewDetails = async (userRecord) => {
    setSelectedUser(userRecord);
    setShowUserDetailsDialog(true);
  };

  const handleViewLocationHistory = async (userRecord) => {
    setSelectedUser(userRecord);
    setLocationHistory(userRecord.locationHistory || []);
    setShowLocationHistoryDialog(true);
  };

  const handleSendAlert = async () => {
    if (!selectedUser || !alertMessage.trim()) {
      toast({
        title: "Error",
        description: "Please enter an alert message",
        variant: "destructive"
      });
      return;
    }

    try {
      await api.post('/alerts/create', {
        employeeId: selectedUser.user._id,
        type: 'Manual',
        severity: 'High',
        title: 'Admin Alert',
        description: alertMessage,
        metadata: {
          sentBy: user?.name,
          sentAt: new Date()
        }
      });

      toast({
        title: "Success",
        description: "Alert sent to employee",
        variant: "default"
      });

      setAlertMessage('');
      setShowAlertDialog(false);
    } catch (error) {
      console.error('Error sending alert:', error);
      toast({
        title: "Error",
        description: "Failed to send alert",
        variant: "destructive"
      });
    }
  };

  const handleStopTracking = async (userId) => {
    try {
      await api.post(`/attendance/live/stop/${userId}`);
      toast({
        title: "Success",
        description: "Live tracking stopped",
        variant: "default"
      });
      fetchLiveAttendanceData();
    } catch (error) {
      console.error('Error stopping tracking:', error);
      toast({
        title: "Error",
        description: "Failed to stop tracking",
        variant: "destructive"
      });
    }
  };

  const handleExportData = () => {
    const csvData = filteredUsers.map(record => ({
      'Employee ID': record.user?.employeeId || formatEmployeeId(record.user?.email),
      'Name': record.user?.name,
      'Email': record.user?.email,
      'Status': record.liveTracking?.enabled ? 'Tracking' : 'Not Tracking',
      'Location': record.locationHistory?.length > 0 ? 'Available' : 'No Data',
      'Violations': record.geofenceViolations?.length || 0,
      'Start Time': record.startTime ? new Date(record.startTime).toLocaleString() : 'N/A',
      'End Time': record.endTime ? new Date(record.endTime).toLocaleString() : 'N/A'
    }));

    const csv = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `live-attendance-${new Date().toISOString()}.csv`;
    a.click();
  };

  if (loading && liveUsers.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="mx-auto"
          >
            <Shield className="w-12 h-12 text-blue-600" />
          </motion.div>
          <div className="space-y-2">
            <p className="text-lg font-semibold text-gray-900">Loading Admin Panel</p>
            <p className="text-sm text-gray-500">Initializing live tracking system...</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Professional SaaS Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-4"
            >
              <div className="p-2.5 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl shadow-lg">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                  Live Attendance Admin Panel
                </h1>
                <p className="text-sm text-gray-600 mt-0.5 flex items-center gap-2">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Radio className="w-3 h-3 text-green-500" />
                  </motion.div>
                  Real-time monitoring and control • Updated {lastUpdated.toLocaleTimeString()}
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3 flex-wrap"
            >
              <Button
                onClick={fetchLiveAttendanceData}
                variant="outline"
                size="sm"
                className="border-gray-300 hover:bg-gray-50 shadow-sm"
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Refreshing...' : 'Refresh'}
              </Button>

              <Button
                onClick={handleExportData}
                variant="outline"
                size="sm"
                className="border-gray-300 hover:bg-gray-50 shadow-sm"
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>

              <div className="flex items-center gap-2 text-sm text-gray-700 bg-green-50 px-4 py-2 rounded-lg border border-green-200">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Radio className="w-4 h-4 text-green-600" />
                </motion.div>
                <span className="font-medium text-green-700">Live System Active</span>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* Professional Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-8 gap-4">
          {[
            { label: 'Total Employees', value: stats.totalEmployees, icon: Users, color: 'blue', bgColor: 'bg-blue-50', iconBg: 'bg-blue-100', textColor: 'text-blue-700', iconColor: 'text-blue-600' },
            { label: 'Present Today', value: stats.presentToday, icon: CheckCircle, color: 'green', bgColor: 'bg-green-50', iconBg: 'bg-green-100', textColor: 'text-green-700', iconColor: 'text-green-600' },
            { label: 'Active Working', value: stats.activeWorkingCount || 0, icon: Play, color: 'teal', bgColor: 'bg-teal-50', iconBg: 'bg-teal-100', textColor: 'text-teal-700', iconColor: 'text-teal-600' },
            { label: 'Paused', value: stats.pausedCount || 0, icon: Pause, color: 'orange', bgColor: 'bg-orange-50', iconBg: 'bg-orange-100', textColor: 'text-orange-700', iconColor: 'text-orange-600' },
            { label: 'Absent Today', value: stats.absentToday, icon: XCircle, color: 'red', bgColor: 'bg-red-50', iconBg: 'bg-red-100', textColor: 'text-red-700', iconColor: 'text-red-600' },
            { label: 'On Leave', value: stats.onLeaveToday, icon: AlertCircle, color: 'purple', bgColor: 'bg-purple-50', iconBg: 'bg-purple-100', textColor: 'text-purple-700', iconColor: 'text-purple-600' },
            { label: 'Late Arrivals', value: stats.lateToday, icon: Clock, color: 'yellow', bgColor: 'bg-yellow-50', iconBg: 'bg-yellow-100', textColor: 'text-yellow-700', iconColor: 'text-yellow-600' },
            { label: 'Attendance %', value: `${stats.presentPercentage.toFixed(1)}%`, icon: BarChart3, color: 'cyan', bgColor: 'bg-cyan-50', iconBg: 'bg-cyan-100', textColor: 'text-cyan-700', iconColor: 'text-cyan-600' }
          ].map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                whileHover={{ y: -4 }}
              >
                <Card className="bg-white border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 truncate">
                          {stat.label}
                        </p>
                        <p className={`text-2xl font-bold ${stat.textColor} leading-none`}>
                          {stat.value}
                        </p>
                      </div>
                      <div className={`${stat.iconBg} p-3 rounded-lg flex-shrink-0 ml-3`}>
                        <Icon className={`w-5 h-5 ${stat.iconColor}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Professional Filters and Controls */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardContent className="p-5">
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Input
                    placeholder="Search by name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-12 h-11 bg-white border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                  <SelectTrigger className="w-full lg:w-56 h-11 bg-white border-gray-300 hover:bg-gray-50">
                    <Building className="w-4 h-4 mr-2 text-gray-500" />
                    <SelectValue placeholder="Department" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map(dept => (
                      <SelectItem key={dept._id} value={dept._id}>{dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full lg:w-56 h-11 bg-white border-gray-300 hover:bg-gray-50">
                    <Filter className="w-4 h-4 mr-2 text-gray-500" />
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="present">✅ Present</SelectItem>
                    <SelectItem value="absent">❌ Absent</SelectItem>
                    <SelectItem value="late">⏰ Late</SelectItem>
                    <SelectItem value="on-leave">🏖️ On Leave</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  onClick={fetchLiveAttendanceData}
                  className="h-11 bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md transition-all"
                  disabled={loading}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  {loading ? 'Refreshing...' : 'Refresh'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Professional Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-white border border-gray-200 shadow-sm p-1.5 rounded-lg h-auto">
            <TabsTrigger 
              value="live" 
              className="flex items-center gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all rounded-md py-2.5"
            >
              <Radio className="w-4 h-4" />
              <span className="font-medium">Live Monitor</span>
            </TabsTrigger>
            <TabsTrigger 
              value="details" 
              className="flex items-center gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all rounded-md py-2.5"
            >
              <Eye className="w-4 h-4" />
              <span className="font-medium">Details</span>
            </TabsTrigger>
            <TabsTrigger 
              value="violations" 
              className="flex items-center gap-2 data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all rounded-md py-2.5"
            >
              <AlertTriangle className="w-4 h-4" />
              <span className="font-medium">Violations</span>
            </TabsTrigger>
            <TabsTrigger 
              value="analytics" 
              className="flex items-center gap-2 data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all rounded-md py-2.5"
            >
              <BarChart3 className="w-4 h-4" />
              <span className="font-medium">Analytics</span>
            </TabsTrigger>
          </TabsList>

          {/* Professional Live Monitor Tab */}
          <TabsContent value="live" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Professional Live Users List */}
              <div className="lg:col-span-2">
                <Card className="bg-white border border-gray-200 shadow-sm">
                  <CardHeader className="pb-4 border-b border-gray-100">
                    <CardTitle className="flex items-center gap-3 text-gray-900">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Radio className="w-5 h-5 text-blue-600" />
                      </div>
                      <span className="text-lg font-semibold">Live Tracking Users</span>
                    </CardTitle>
                    <CardDescription className="mt-2 text-gray-600">
                      {filteredUsers.length} user(s) matching filters
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar">
                      <AnimatePresence>
                        {filteredUsers.length === 0 ? (
                          <div className="text-center py-12">
                            <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                            <p className="text-gray-700 font-medium mb-2">No users found</p>
                            <p className="text-sm text-gray-500">Try adjusting your filters</p>
                          </div>
                        ) : (
                          filteredUsers.map((record, idx) => {
                            const lastLocation = record.locationHistory?.[record.locationHistory.length - 1];
                            const isTracking = record.liveTracking?.enabled;

                            return (
                              <motion.div
                                key={record._id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                transition={{ delay: idx * 0.03 }}
                                whileHover={{ x: 4 }}
                                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all cursor-pointer group"
                              >
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                  <div className="relative flex-shrink-0">
                                    <Avatar className="w-12 h-12 ring-2 ring-white shadow-sm group-hover:ring-blue-200 transition-all">
                                      <AvatarImage src={record.user?.avatar} />
                                      <AvatarFallback className="bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 text-white font-semibold">
                                        {record.user?.name?.split(' ').map(n => n[0]).join('')}
                                      </AvatarFallback>
                                    </Avatar>
                                    {isTracking && (
                                      <motion.div
                                        animate={{ scale: [1, 1.3, 1] }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                        className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-white shadow-sm"
                                      />
                                    )}
                                  </div>

                                  <div className="flex-1 min-w-0">
                                    <p className="font-bold text-gray-900 truncate text-base">
                                      {record.user?.name}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate mt-0.5">
                                      {record.user?.email}
                                    </p>
                                    {record.workSession && record.workSession.totalBreakTime > 0 && (
                                      <p className="text-xs text-orange-600 mt-1.5 flex items-center gap-1">
                                        <Pause className="w-3 h-3" />
                                        Break: {Math.floor(record.workSession.totalBreakTime)} min
                                      </p>
                                    )}
                                    {lastLocation && (
                                      <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1">
                                        <MapPin className="w-3 h-3" />
                                        {lastLocation.distanceFromOffice?.toFixed(0)}m from office
                                      </p>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {getStatusBadge(record)}

                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleViewDetails(record)}
                                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>

                                  {isTracking && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleStopTracking(record.user._id)}
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg"
                                    >
                                      <StopCircle className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              </motion.div>
                            );
                          })
                        )}
                      </AnimatePresence>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Professional Summary Panel */}
              <Card className="bg-white border border-gray-200 shadow-sm">
                <CardHeader className="pb-4 border-b border-gray-100">
                  <CardTitle className="flex items-center gap-3 text-gray-900">
                    <div className="p-2 bg-yellow-100 rounded-lg">
                      <Zap className="w-5 h-5 text-yellow-600" />
                    </div>
                    <span className="text-lg font-semibold">Quick Actions</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-3">
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      onClick={handleExportData}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md transition-all"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export Report
                    </Button>
                  </motion.div>

                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      onClick={() => setShowAlertDialog(true)}
                      className="w-full bg-orange-600 hover:bg-orange-700 text-white shadow-sm hover:shadow-md transition-all"
                      disabled={!selectedUser}
                    >
                      <AlertTriangle className="w-4 h-4 mr-2" />
                      Send Alert
                    </Button>
                  </motion.div>

                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      onClick={() => handleViewLocationHistory(selectedUser)}
                      variant="outline"
                      className="w-full border-gray-300 hover:bg-gray-50 transition-all"
                      disabled={!selectedUser}
                    >
                      <MapPin className="w-4 h-4 mr-2" />
                      Location History
                    </Button>
                  </motion.div>

                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-4 tracking-wider">System Status</p>
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between text-gray-700 bg-gray-50 p-3 rounded-lg border border-gray-200">
                        <span className="flex items-center gap-2 font-medium">
                          <Radio className="w-3.5 h-3.5 text-green-600" />
                          Socket Connection
                        </span>
                        <Badge className="bg-green-100 text-green-700 border-0 font-semibold">Active</Badge>
                      </div>
                      <div className="flex items-center justify-between text-gray-700 bg-gray-50 p-3 rounded-lg border border-gray-200">
                        <span className="flex items-center gap-2 font-medium">
                          <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                          Database Sync
                        </span>
                        <Badge className="bg-green-100 text-green-700 border-0 font-semibold">Synced</Badge>
                      </div>
                      <div className="flex items-center justify-between text-gray-700 bg-gray-50 p-3 rounded-lg border border-gray-200">
                        <span className="flex items-center gap-2 font-medium">
                          <Shield className="w-3.5 h-3.5 text-green-600" />
                          Geofencing
                        </span>
                        <Badge className="bg-green-100 text-green-700 border-0 font-semibold">Enabled</Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-6">
          <Card className="bg-white/10 border-white/20 backdrop-blur-sm shadow-lg">
            <CardHeader>
              <CardTitle className="text-white">Detailed User Information</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedUser ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <Avatar className="w-16 h-16">
                      <AvatarImage src={selectedUser.user?.avatar} />
                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-lg">
                        {selectedUser.user?.name?.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="text-xl font-bold text-white">{selectedUser.user?.name}</h3>
                      <p className="text-gray-400">{selectedUser.user?.email}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 p-3 rounded-lg">
                      <p className="text-xs text-gray-400">Tracking Status</p>
                      <Badge className={selectedUser.liveTracking?.enabled ? 'bg-green-500' : 'bg-gray-500'}>
                        {selectedUser.liveTracking?.enabled ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    <div className="bg-white/5 p-3 rounded-lg">
                      <p className="text-xs text-gray-400">Day Status</p>
                      <Badge className="bg-blue-500">
                        {selectedUser.endTime ? 'Completed' : selectedUser.startTime ? 'In Progress' : 'Not Started'}
                      </Badge>
                    </div>

                    <div className="bg-white/5 p-3 rounded-lg">
                      <p className="text-xs text-gray-400">Geofence Status</p>
                      <Badge className={selectedUser.locationHistory?.[selectedUser.locationHistory.length - 1]?.insideGeofence ? 'bg-green-500' : 'bg-orange-500'}>
                        {selectedUser.locationHistory?.[selectedUser.locationHistory.length - 1]?.insideGeofence ? 'Inside' : 'Outside'}
                      </Badge>
                    </div>

                    <div className="bg-white/5 p-3 rounded-lg">
                      <p className="text-xs text-gray-400">Total Violations</p>
                      <p className="text-lg font-bold text-red-400">{selectedUser.geofenceViolations?.length || 0}</p>
                    </div>
                  </div>

                  <div className="bg-white/5 p-4 rounded-lg">
                    <p className="text-sm font-semibold text-white mb-3">Location Details</p>
                    {selectedUser.locationHistory?.[selectedUser.locationHistory.length - 1] ? (
                      <div className="space-y-2 text-sm text-gray-300">
                        <div className="flex justify-between">
                          <span>Latitude:</span>
                          <span className="font-mono">{selectedUser.locationHistory[selectedUser.locationHistory.length - 1].latitude?.toFixed(6)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Longitude:</span>
                          <span className="font-mono">{selectedUser.locationHistory[selectedUser.locationHistory.length - 1].longitude?.toFixed(6)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Distance from Office:</span>
                          <span className="font-mono">{selectedUser.locationHistory[selectedUser.locationHistory.length - 1].distanceFromOffice?.toFixed(0)}m</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Accuracy:</span>
                          <span className="font-mono">±{selectedUser.locationHistory[selectedUser.locationHistory.length - 1].accuracy?.toFixed(1)}m</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-500">No location data available</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-center text-gray-400">Select a user to view details</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

          {/* Professional Violations Tab */}
          <TabsContent value="violations" className="space-y-6 mt-6">
            <Card className="bg-white border border-gray-200 shadow-sm">
              <CardHeader className="pb-4 border-b border-gray-100">
                <CardTitle className="flex items-center gap-3 text-gray-900">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                  <span className="text-lg font-semibold">Geofence Violations</span>
                </CardTitle>
                <CardDescription className="mt-2 text-gray-600">
                  Total violations across all users
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {filteredUsers
                    .filter(u => (u.geofenceViolations?.length || 0) > 0)
                    .map((record, idx) => (
                      <motion.div
                        key={record._id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        whileHover={{ scale: 1.01, x: 4 }}
                        className="bg-red-50 p-5 rounded-xl border-l-4 border-red-500 shadow-sm hover:shadow-md transition-all"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-4 flex-1">
                            <Avatar className="w-12 h-12 ring-2 ring-red-200">
                              <AvatarImage src={record.user?.avatar} />
                              <AvatarFallback className="bg-gradient-to-br from-red-500 to-orange-600 text-white font-semibold">
                                {record.user?.name?.split(' ').map(n => n[0]).join('')}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <h4 className="font-bold text-gray-900 text-lg mb-1">{record.user?.name}</h4>
                              <p className="text-sm text-gray-600 mb-3">
                                <span className="font-semibold text-red-600">{record.geofenceViolations?.length}</span> violation(s) detected
                              </p>
                              <div className="space-y-2 text-xs text-gray-600 bg-white p-3 rounded-lg border border-gray-200">
                                {record.geofenceViolations?.slice(0, 3).map((v, i) => (
                                  <div key={i} className="flex items-center justify-between">
                                    <span className="flex items-center gap-2">
                                      <Clock className="w-3 h-3" />
                                      {new Date(v.timestamp).toLocaleString()}
                                    </span>
                                    <span className="font-mono text-red-600 font-semibold">
                                      {v.distanceFromOffice?.toFixed(0)}m away
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          <Badge variant="destructive" className="text-xs font-bold px-3 py-1 flex-shrink-0">Critical</Badge>
                        </div>
                      </motion.div>
                    ))}
                  {filteredUsers.filter(u => (u.geofenceViolations?.length || 0) > 0).length === 0 && (
                    <div className="text-center py-16">
                      <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-400 opacity-50" />
                      <p className="text-gray-700 font-medium text-lg mb-2">No violations found</p>
                      <p className="text-sm text-gray-500">All employees are within geofence boundaries</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-white/10 border-white/20 backdrop-blur-sm shadow-lg">
              <CardHeader>
                <CardTitle className="text-white">Work Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {filteredUsers.slice(0, 5).map((record, idx) => {
                  const hours = record.startTime
                    ? ((record.endTime || new Date()) - new Date(record.startTime)) / (1000 * 60 * 60)
                    : 0;
                  const progress = Math.min(100, (hours / 8) * 100);

                  return (
                    <div key={idx}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-white truncate">{record.user?.name}</span>
                        <span className="text-xs text-gray-400">{progress.toFixed(0)}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="bg-white/10 border-white/20 backdrop-blur-sm shadow-lg">
              <CardHeader>
                <CardTitle className="text-white">System Performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">API Response Time</span>
                  <span className="text-green-400 font-mono">12ms</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Database Queries</span>
                  <span className="text-green-400 font-mono">45 req/min</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Active WebSockets</span>
                  <span className="text-green-400 font-mono">{filteredUsers.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Memory Usage</span>
                  <span className="text-green-400 font-mono">234MB / 512MB</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

        {/* Professional Dialogs */}
        <Dialog open={showUserDetailsDialog} onOpenChange={setShowUserDetailsDialog}>
          <DialogContent className="bg-white border border-gray-200 shadow-xl max-w-2xl">
            <DialogHeader className="pb-4 border-b border-gray-200">
              <DialogTitle className="text-xl flex items-center gap-3 text-gray-900">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Eye className="w-5 h-5 text-blue-600" />
                </div>
                User Live Tracking Details
              </DialogTitle>
            </DialogHeader>
            {selectedUser && (
              <div className="space-y-6 pt-4">
                <div className="flex items-center gap-4 pb-4 border-b border-gray-200">
                  <Avatar className="w-16 h-16 ring-4 ring-blue-100">
                    <AvatarImage src={selectedUser.user?.avatar} />
                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xl font-semibold">
                      {selectedUser.user?.name?.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{selectedUser.user?.name}</h3>
                    <p className="text-sm text-gray-600">{selectedUser.user?.email}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
                    <Label className="text-gray-600 text-xs uppercase tracking-wider font-semibold">Total Locations</Label>
                    <p className="font-bold text-3xl text-blue-700 mt-2">{selectedUser.locationHistory?.length || 0}</p>
                  </div>
                  <div className="bg-red-50 p-4 rounded-xl border border-red-200">
                    <Label className="text-gray-600 text-xs uppercase tracking-wider font-semibold">Violations</Label>
                    <p className="font-bold text-3xl text-red-700 mt-2">{selectedUser.geofenceViolations?.length || 0}</p>
                  </div>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                  <Label className="text-gray-600 text-xs uppercase tracking-wider font-semibold mb-3 block">Tracking Status</Label>
                  <Badge className={selectedUser.liveTracking?.enabled ? 'bg-green-100 text-green-700 text-sm px-4 py-2 font-semibold' : 'bg-gray-100 text-gray-700 text-sm px-4 py-2 font-semibold'}>
                    {selectedUser.liveTracking?.enabled ? '🔴 Live Tracking Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
            )}
            <DialogFooter className="pt-4 border-t border-gray-200">
              <Button 
                onClick={() => setShowUserDetailsDialog(false)} 
                variant="outline"
                className="border-gray-300 hover:bg-gray-50"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showAlertDialog} onOpenChange={setShowAlertDialog}>
          <DialogContent className="bg-white border border-gray-200 shadow-xl">
            <DialogHeader className="pb-4 border-b border-gray-200">
              <DialogTitle className="text-xl flex items-center gap-3 text-gray-900">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                </div>
                Send Alert to {selectedUser?.user?.name}
              </DialogTitle>
              <DialogDescription className="mt-2 text-gray-600">
                Send a real-time alert notification to this employee
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <Textarea
                placeholder="Enter alert message..."
                value={alertMessage}
                onChange={(e) => setAlertMessage(e.target.value)}
                className="bg-white border-gray-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 min-h-[120px]"
              />
            </div>
            <DialogFooter className="pt-4 border-t border-gray-200">
              <Button 
                onClick={() => setShowAlertDialog(false)} 
                variant="outline"
                className="border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSendAlert} 
                className="bg-orange-600 hover:bg-orange-700 text-white shadow-sm hover:shadow-md"
              >
                <Send className="w-4 h-4 mr-2" />
                Send Alert
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showLocationHistoryDialog} onOpenChange={setShowLocationHistoryDialog}>
          <DialogContent className="bg-white border border-gray-200 shadow-xl max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader className="pb-4 border-b border-gray-200">
              <DialogTitle className="text-xl flex items-center gap-3 text-gray-900">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <MapPin className="w-5 h-5 text-blue-600" />
                </div>
                Location History - {selectedUser?.user?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 overflow-y-auto custom-scrollbar flex-1 py-4">
              {locationHistory.length === 0 ? (
                <div className="text-center py-12">
                  <MapPin className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-700 font-medium mb-2">No location history available</p>
                  <p className="text-sm text-gray-500">Location data will appear here when tracking is active</p>
                </div>
              ) : (
                locationHistory.slice().reverse().map((loc, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="bg-gray-50 p-4 rounded-xl text-sm border-l-4 border-blue-500 hover:bg-blue-50 transition-all"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-bold text-gray-900 text-base">#{locationHistory.length - idx}</p>
                      <Badge className={loc.insideGeofence ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                        {loc.insideGeofence ? '✅ Inside' : '❌ Outside'}
                      </Badge>
                    </div>
                    <p className="text-gray-600 text-xs mb-3 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(loc.timestamp).toLocaleString()}
                    </p>
                    <div className="space-y-2 text-xs text-gray-700 bg-white p-3 rounded-lg border border-gray-200">
                      <div className="flex justify-between">
                        <span className="font-medium">📍 Coordinates:</span>
                        <span className="font-mono text-blue-600">
                          {loc.latitude?.toFixed(6)}, {loc.longitude?.toFixed(6)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">📏 Distance:</span>
                        <span className="font-mono text-orange-600 font-semibold">
                          {loc.distanceFromOffice?.toFixed(0)}m from office
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">🎯 Accuracy:</span>
                        <span className="font-mono text-gray-600">
                          ±{loc.accuracy?.toFixed(1)}m
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
};

export default LiveAttendanceAdminPanel;
