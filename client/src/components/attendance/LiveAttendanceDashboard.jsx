import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  UserCheck, 
  UserX, 
  Clock, 
  Calendar,
  TrendingUp,
  TrendingDown,
  MapPin,
  Activity,
  Timer,
  Building,
  Wifi,
  WifiOff,
  CheckCircle,
  XCircle,
  AlertTriangle,
  BarChart3,
  PieChart,
  RefreshCw,
  Filter,
  Search,
  Eye,
  MoreVertical,
  Sparkles,
  Zap,
  Radio
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
import { useSocketContext } from '../../context/socket-context';
import api from '../../lib/api';
import { useToast } from '../../hooks/use-toast';

const LiveAttendanceDashboard = () => {
  const { user } = useAuth();
  const { socket } = useSocketContext();
  const { toast } = useToast();
  
  const [attendanceData, setAttendanceData] = useState([]);
  const [stats, setStats] = useState({
    totalEmployees: 0,
    presentToday: 0,
    absentToday: 0,
    avgAttendance: 0,
    lateArrivals: 0,
    earlyDepartures: 0
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [activeTab, setActiveTab] = useState('overview');
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Fetch live attendance data
  const fetchLiveAttendance = async (showRefreshing = false) => {
    try {
      if (showRefreshing) setRefreshing(true);
      const response = await api.get('/attendance/live');
      if (response.data.success) {
        setAttendanceData(response.data.attendance);
        setStats(response.data.stats);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Error fetching live attendance:', error);
      toast({
        title: "Error",
        description: "Failed to fetch live attendance data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Socket event listeners for real-time updates
  useEffect(() => {
    if (socket) {
      socket.on('attendance:day-started', (data) => {
        setAttendanceData(prev => {
          const updated = prev.map(record => 
            record.user._id === data.userId 
              ? { ...record, startDayTime: data.startTime, isPresent: true }
              : record
          );
          return updated;
        });
        
        setStats(prev => ({
          ...prev,
          presentToday: prev.presentToday + 1,
          absentToday: Math.max(0, prev.absentToday - 1)
        }));
        
        toast({
          title: "Live Update",
          description: `${data.userName || 'Employee'} started their day`,
          variant: "default"
        });
      });

      socket.on('attendance:day-ended', (data) => {
        setAttendanceData(prev => 
          prev.map(record => 
            record.user._id === data.userId 
              ? { ...record, endDayTime: data.endTime, hoursWorked: data.hoursWorked }
              : record
          )
        );
      });

      return () => {
        socket.off('attendance:day-started');
        socket.off('attendance:day-ended');
      };
    }
  }, [socket, toast]);

  useEffect(() => {
    fetchLiveAttendance();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => fetchLiveAttendance(false), 30000);
    return () => clearInterval(interval);
  }, []);

  // Filter attendance data
  const filteredAttendance = attendanceData.filter(record => {
    const matchesSearch = record.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         record.user.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterType === 'all' || 
                         (filterType === 'present' && record.isPresent) ||
                         (filterType === 'absent' && !record.isPresent) ||
                         (filterType === 'late' && record.isLate) ||
                         (filterType === 'remote' && record.isRemote);
    
    return matchesSearch && matchesFilter;
  });

  const calculateWorkingHours = (startTime, endTime) => {
    if (!startTime) return 0;
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    return Math.max(0, (end - start) / (1000 * 60 * 60));
  };

  const getStatusColor = (record) => {
    if (!record.isPresent) return 'bg-red-500';
    if (record.endDayTime) return 'bg-gray-500';
    if (calculateWorkingHours(record.startDayTime) >= 8) return 'bg-green-500';
    return 'bg-blue-500';
  };

  const getStatusText = (record) => {
    if (!record.isPresent) return 'Absent';
    if (record.endDayTime) return 'Completed';
    if (calculateWorkingHours(record.startDayTime) >= 8) return 'Full Day';
    return 'Working';
  };

  const getStatusBadgeVariant = (record) => {
    if (!record.isPresent) return 'destructive';
    if (record.endDayTime) return 'secondary';
    if (calculateWorkingHours(record.startDayTime) >= 8) return 'default';
    return 'default';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
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
            <Activity className="w-12 h-12 text-blue-500" />
          </motion.div>
          <div className="space-y-2">
            <p className="text-lg font-semibold text-foreground">Loading Live Attendance</p>
            <p className="text-sm text-muted-foreground">Fetching real-time data...</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Professional SaaS Header */}
      <div className="sticky top-0 z-30 bg-card/90 backdrop-blur-xl border-b border-border/70 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-4"
            >
              <div className="p-2.5 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl shadow-lg">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">
                  Live Attendance Dashboard
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Radio className="w-3 h-3 text-emerald-500" />
                  </motion.div>
                  Real-time monitoring • Updated {lastUpdated.toLocaleTimeString()}
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-wrap items-center gap-3"
            >
              <Button
                onClick={() => fetchLiveAttendance(true)}
                variant="outline"
                size="sm"
                className="border-border/70 hover:bg-muted/60 shadow-sm"
                disabled={refreshing}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </Button>

              <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-4 py-2 rounded-lg border border-emerald-500/30">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Activity className="w-4 h-4 text-emerald-500" />
                </motion.div>
                <span className="font-medium">Live Updates Active</span>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Professional Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {[
            { label: 'Total Employees', value: stats.totalEmployees, icon: Users, iconBg: 'bg-blue-500/15', textColor: 'text-blue-600 dark:text-blue-400', iconColor: 'text-blue-500' },
            { label: 'Present Today', value: stats.presentToday, icon: UserCheck, iconBg: 'bg-emerald-500/15', textColor: 'text-emerald-600 dark:text-emerald-400', iconColor: 'text-emerald-500' },
            { label: 'Absent Today', value: stats.absentToday, icon: UserX, iconBg: 'bg-red-500/15', textColor: 'text-red-600 dark:text-red-400', iconColor: 'text-red-500' },
            { label: 'Avg Attendance', value: `${stats.avgAttendance}%`, icon: TrendingUp, iconBg: 'bg-purple-500/15', textColor: 'text-purple-600 dark:text-purple-400', iconColor: 'text-purple-500' },
            { label: 'Late Arrivals', value: stats.lateArrivals, icon: Clock, iconBg: 'bg-orange-500/15', textColor: 'text-orange-600 dark:text-orange-400', iconColor: 'text-orange-500' },
            { label: 'Early Departures', value: stats.earlyDepartures, icon: Timer, iconBg: 'bg-pink-500/15', textColor: 'text-pink-600 dark:text-pink-400', iconColor: 'text-pink-500' }
          ].map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                whileHover={{ y: -4 }}
              >
                <Card interactive className="border-border/70 overflow-hidden">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 truncate">
                          {stat.label}
                        </p>
                        <p className={`text-2xl font-bold ${stat.textColor} leading-none tabular-nums`}>
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

        {/* Professional Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="border-border/70">
            <CardContent className="p-5">
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                  <Input
                    placeholder="Search employees by name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-12 h-11 bg-background/70 border-border/70 focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-full lg:w-56 h-11 bg-background/70 border-border/70">
                    <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border/70">
                    <SelectItem value="all">All Employees</SelectItem>
                    <SelectItem value="present">✅ Present</SelectItem>
                    <SelectItem value="absent">❌ Absent</SelectItem>
                    <SelectItem value="late">⏰ Late Arrivals</SelectItem>
                    <SelectItem value="remote">🏠 Remote Work</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Professional Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 bg-muted/50 border border-border/60 p-1.5 rounded-xl h-auto gap-1">
            <TabsTrigger
              value="overview"
              className="flex items-center gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all rounded-lg py-2.5"
            >
              <Activity className="w-4 h-4" />
              <span className="font-medium">Live Overview</span>
            </TabsTrigger>
            <TabsTrigger
              value="grid"
              className="flex items-center gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all rounded-lg py-2.5"
            >
              <Users className="w-4 h-4" />
              <span className="font-medium">Employee Grid</span>
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              className="flex items-center gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all rounded-lg py-2.5"
            >
              <BarChart3 className="w-4 h-4" />
              <span className="font-medium">Analytics</span>
            </TabsTrigger>
          </TabsList>

          {/* Live Overview Tab */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Attendance Progress Card */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <Card className="border-border/70">
                  <CardHeader className="pb-4 border-b border-border/60">
                    <CardTitle className="flex items-center gap-3 text-foreground">
                      <div className="p-2 bg-blue-500/15 rounded-lg">
                        <PieChart className="w-5 h-5 text-blue-500" />
                      </div>
                      <span className="text-lg font-semibold">Today's Attendance</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Present</span>
                        <span className="text-sm font-semibold text-foreground tabular-nums">{stats.presentToday}/{stats.totalEmployees}</span>
                      </div>
                      <Progress
                        value={stats.totalEmployees > 0 ? (stats.presentToday / stats.totalEmployees) * 100 : 0}
                        className="h-2.5"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        className="text-center p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/25"
                      >
                        <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{stats.presentToday}</div>
                        <div className="text-sm font-medium text-emerald-700 dark:text-emerald-300 mt-1">Present</div>
                      </motion.div>
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        className="text-center p-4 bg-destructive/10 rounded-xl border border-destructive/25"
                      >
                        <div className="text-3xl font-bold text-destructive tabular-nums">{stats.absentToday}</div>
                        <div className="text-sm font-medium text-destructive mt-1">Absent</div>
                      </motion.div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Recent Activity Card */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <Card className="border-border/70">
                  <CardHeader className="pb-4 border-b border-border/60">
                    <CardTitle className="flex items-center gap-3 text-foreground">
                      <div className="p-2 bg-emerald-500/15 rounded-lg">
                        <Zap className="w-5 h-5 text-emerald-500" />
                      </div>
                      <span className="text-lg font-semibold">Recent Activity</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
                      <AnimatePresence>
                        {filteredAttendance
                          .filter(record => record.startDayTime)
                          .sort((a, b) => new Date(b.startDayTime) - new Date(a.startDayTime))
                          .slice(0, 5)
                          .map((record, index) => (
                            <motion.div
                              key={record._id}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 20 }}
                              transition={{ delay: index * 0.05 }}
                              whileHover={{ x: 4 }}
                              className="flex items-center gap-3 p-3 bg-muted/40 rounded-xl border border-border/60 hover:border-blue-500/40 hover:bg-blue-500/5 transition-all cursor-pointer"
                            >
                              <Avatar className="w-10 h-10 ring-2 ring-border/70 shadow-sm">
                                <AvatarImage src={record.user.avatar} />
                                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-sm font-semibold">
                                  {record.user.name.split(' ').map(n => n[0]).join('')}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">
                                  {record.user.name}
                                </p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <Clock className="w-3 h-3" />
                                  Started at {new Date(record.startDayTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                              <Badge
                                variant={getStatusBadgeVariant(record)}
                                className="text-xs font-medium flex-shrink-0"
                              >
                                {getStatusText(record)}
                              </Badge>
                            </motion.div>
                          ))}
                        {filteredAttendance.filter(record => record.startDayTime).length === 0 && (
                          <div className="text-center py-12 text-muted-foreground">
                            <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p className="font-medium text-foreground">No recent activity</p>
                            <p className="text-sm mt-1">Activity will appear here when employees start their day</p>
                          </div>
                        )}
                      </AnimatePresence>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </TabsContent>

          {/* Employee Grid Tab */}
          <TabsContent value="grid" className="space-y-6 mt-6">
            {filteredAttendance.length === 0 ? (
              <Card className="border-border/70">
                <CardContent className="py-16 text-center">
                  <UserX className="w-16 h-16 mx-auto mb-4 text-muted-foreground/40" />
                  <p className="text-lg font-semibold text-foreground mb-2">No employees found</p>
                  <p className="text-sm text-muted-foreground">Try adjusting your search or filter criteria</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                <AnimatePresence>
                  {filteredAttendance.map((record, index) => {
                    const workingHours = calculateWorkingHours(record.startDayTime, record.endDayTime);
                    const isOnline = record.isPresent && !record.endDayTime;
                    const progress = Math.min(100, (workingHours / 8) * 100);

                    return (
                      <motion.div
                        key={record._id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: index * 0.03 }}
                        whileHover={{ y: -4 }}
                      >
                        <Card interactive className="border-border/70 overflow-hidden h-full">
                          <CardContent className="p-5">
                            {/* Header with Avatar */}
                            <div className="flex items-start justify-between mb-5">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="relative flex-shrink-0">
                                  <Avatar className="w-12 h-12 ring-2 ring-border/70 shadow-sm">
                                    <AvatarImage src={record.user.avatar} />
                                    <AvatarFallback className="bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 text-white font-semibold text-sm">
                                      {record.user.name.split(' ').map(n => n[0]).join('')}
                                    </AvatarFallback>
                                  </Avatar>
                                  <motion.div
                                    animate={{ scale: [1, 1.2, 1] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                    className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-card shadow-sm ${getStatusColor(record)}`}
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-bold text-foreground truncate text-base leading-tight">
                                    {record.user.name}
                                  </h3>
                                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                                    {record.user.email}
                                  </p>
                                </div>
                              </div>

                              <div className="flex-shrink-0">
                                {isOnline ? (
                                  <motion.div
                                    animate={{ scale: [1, 1.2, 1] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                  >
                                    <Wifi className="w-5 h-5 text-emerald-500" />
                                  </motion.div>
                                ) : (
                                  <WifiOff className="w-5 h-5 text-muted-foreground/40" />
                                )}
                              </div>
                            </div>

                            {/* Status and Info */}
                            <div className="space-y-3.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-muted-foreground">Status</span>
                                <Badge
                                  variant={getStatusBadgeVariant(record)}
                                  className="text-xs font-semibold"
                                >
                                  {getStatusText(record)}
                                </Badge>
                              </div>

                              {record.startDayTime && (
                                <div className="flex items-center justify-between text-sm py-1.5 border-b border-border/60">
                                  <span className="text-muted-foreground flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5" />
                                    Start:
                                  </span>
                                  <span className="font-semibold text-foreground tabular-nums">
                                    {new Date(record.startDayTime).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </span>
                                </div>
                              )}

                              {record.endDayTime && (
                                <div className="flex items-center justify-between text-sm py-1.5 border-b border-border/60">
                                  <span className="text-muted-foreground flex items-center gap-1.5">
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    End:
                                  </span>
                                  <span className="font-semibold text-foreground tabular-nums">
                                    {new Date(record.endDayTime).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </span>
                                </div>
                              )}

                              <div className="flex items-center justify-between text-sm pt-1">
                                <span className="text-muted-foreground font-medium">Hours Worked</span>
                                <span className={`font-bold text-lg tabular-nums ${workingHours >= 8 ? 'text-emerald-600 dark:text-emerald-400' : workingHours >= 6 ? 'text-orange-600 dark:text-orange-400' : 'text-destructive'}`}>
                                  {workingHours.toFixed(1)}h
                                </span>
                              </div>

                              {record.isPresent && !record.endDayTime && (
                                <div className="mt-4 pt-3 border-t border-border/60">
                                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                                    <span className="font-medium">Daily Progress</span>
                                    <span className="font-bold tabular-nums">{progress.toFixed(0)}%</span>
                                  </div>
                                  <Progress
                                    value={progress}
                                    className="h-2"
                                  />
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-border/70">
                <CardHeader className="border-b border-border/60">
                  <CardTitle className="flex items-center gap-3 text-foreground">
                    <div className="p-2 bg-blue-500/15 rounded-lg">
                      <BarChart3 className="w-5 h-5 text-blue-500" />
                    </div>
                    <span className="text-lg font-semibold">Attendance Trends</span>
                  </CardTitle>
                  <CardDescription className="mt-2">Weekly attendance patterns</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="text-center py-16 text-muted-foreground">
                    <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p className="font-medium text-foreground">Analytics charts coming soon</p>
                    <p className="text-sm mt-2">Visual insights will be displayed here</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/70">
                <CardHeader className="border-b border-border/60">
                  <CardTitle className="flex items-center gap-3 text-foreground">
                    <div className="p-2 bg-purple-500/15 rounded-lg">
                      <PieChart className="w-5 h-5 text-purple-500" />
                    </div>
                    <span className="text-lg font-semibold">Department Breakdown</span>
                  </CardTitle>
                  <CardDescription className="mt-2">Attendance by department</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="text-center py-16 text-muted-foreground">
                    <PieChart className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p className="font-medium text-foreground">Department analytics coming soon</p>
                    <p className="text-sm mt-2">Detailed breakdowns will be available here</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default LiveAttendanceDashboard;
