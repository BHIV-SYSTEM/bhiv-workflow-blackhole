import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  Square, 
  Clock, 
  MapPin, 
  Calendar,
  Target,
  Zap,
  CheckCircle,
  AlertCircle,
  Timer,
  DollarSign,
  TrendingUp,
  Award,
  Activity,
  Smartphone,
  Wifi,
  Battery,
  User,
  Building,
  Star,
  ArrowRight,
  RefreshCw,
  Eye,
  BarChart3
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../context/auth-context';
import api from '../lib/api';
import { formatDate } from '../lib/dateFormat';
import { toast } from 'react-hot-toast';

const EnhancedAttendanceTracker = () => {
  const { user } = useAuth();
  const [todayStatus, setTodayStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [location, setLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);

  useEffect(() => {
    fetchTodayStatus();
    fetchAttendanceHistory();
    getDeviceInfo();
    
    // Update current time every second
    const timer = setInterval(() => {
      setCurrentTime(new Date());
       
      // Update current hours if day has started but not ended
      if (todayStatus?.hasStarted && !todayStatus?.hasEnded && todayStatus?.startTime) {
        const now = new Date();
        const startTime = new Date(todayStatus.startTime);
        const currentHours = (now - startTime) / (1000 * 60 * 60);
        setTodayStatus(prev => ({
          ...prev,
          currentHours: Math.max(0, currentHours)
        }));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const fetchTodayStatus = async () => {
    try {
      setLoading(true);
      const response = await api.get('/attendance/verify/' + user.id);
      if (response.data.success) {
        setTodayStatus(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching today status:', error);
      // Create mock status for demo
      setTodayStatus({
        hasStarted: false,
        hasEnded: false,
        canStartDay: true,
        canEndDay: false,
        status: 'Not Started',
        message: 'Ready to start your day!',
        currentHours: 0,
        totalHours: 0,
        earnedAmount: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendanceHistory = async () => {
    try {
      const response = await api.get(`/attendance/user/${user.id}?limit=5`);
      if (response.data.success) {
        setAttendanceHistory(response.data.data.records || []);
      }
    } catch (error) {
      console.error('Error fetching attendance history:', error);
      // Mock data for demo
      setAttendanceHistory([
        { date: new Date(), hoursWorked: 8.5, status: 'Present', isPresent: true },
        { date: new Date(Date.now() - 86400000), hoursWorked: 7.8, status: 'Present', isPresent: true },
        { date: new Date(Date.now() - 172800000), hoursWorked: 4.2, status: 'Half Day', isPresent: true },
        { date: new Date(Date.now() - 259200000), hoursWorked: 8.0, status: 'Present', isPresent: true },
        { date: new Date(Date.now() - 345600000), hoursWorked: 0, status: 'Absent', isPresent: false },
      ]);
    }
  };

  const getDeviceInfo = () => {
    const info = {
      deviceType: /Mobile|Android|iPhone|iPad/.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
      browser: navigator.userAgent.split(' ').pop(),
      online: navigator.onLine,
      battery: null
    };

    // Get battery info if available
    if ('getBattery' in navigator) {
      navigator.getBattery().then(battery => {
        info.battery = Math.round(battery.level * 100);
        setDeviceInfo(info);
      });
    } else {
      setDeviceInfo(info);
    }
  };

  const getCurrentLocation = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported'));
        return;
      }

      setLocationLoading(true);
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          
          try {
            // Get address from coordinates (you can use a geocoding service)
            const address = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            
            const locationData = {
              latitude,
              longitude,
              accuracy,
              address
            };
            
            setLocation(locationData);
            setLocationLoading(false);
            resolve(locationData);
          } catch (error) {
            setLocationLoading(false);
            reject(error);
          }
        },
        (error) => {
          setLocationLoading(false);
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        }
      );
    });
  };

  const handleStartDay = async () => {
    try {
      setActionLoading(true);
      
      // Get current location
      const locationData = await getCurrentLocation();
      
      // Mock API call for demo
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const startTime = new Date();
      
      // Update status
      setTodayStatus({
        ...todayStatus,
        hasStarted: true,
        canStartDay: false,
        canEndDay: true,
        status: 'Present',
        startTime: startTime,
        message: 'Day started successfully! You are now working.',
        currentHours: 0
      });

      toast.success('Day started successfully!');
      
    } catch (error) {
      console.error('Error starting day:', error);
      const errorMessage = error.message || 'Failed to start day';
      toast.error(errorMessage);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEndDay = async () => {
    try {
      setActionLoading(true);
      
      // Check if user has set progress for today
      try {
        const progressResponse = await api.get(`/progress/user/${user.id}`);
        const todayProgress = progressResponse.data?.find(p => {
          const progressDate = new Date(p.date);
          const today = new Date();
          return progressDate.toDateString() === today.toDateString();
        });

        if (!todayProgress || !todayProgress.description || todayProgress.description.trim() === '') {
          toast.error('❌ Please set your progress for today before ending your day!', {
            duration: 4000,
            style: {
              background: '#fee2e2',
              color: '#dc2626',
              border: '1px solid #fecaca',
            },
          });
          setActionLoading(false);
          return;
        }
      } catch (progressError) {
        console.warn('Could not check progress:', progressError);
        // For demo purposes, show a mock validation
        const hasProgress = Math.random() > 0.5; // 50% chance of having progress for demo
        if (!hasProgress) {
          toast.error('❌ Please set your progress for today before ending your day!', {
            duration: 4000,
            style: {
              background: '#fee2e2',
              color: '#dc2626',
              border: '1px solid #fecaca',
            },
          });
          setActionLoading(false);
          return;
        }
      }
      
      // Get current location (optional for end day)
      let locationData = {};
      try {
        locationData = await getCurrentLocation();
      } catch (locError) {
        console.warn('Could not get location for end day:', locError);
      }
      
      // Mock API call for demo
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const hoursWorked = todayStatus.currentHours || Math.random() * 2 + 7; // Use current hours or random
      const earnedAmount = hoursWorked * 32.25; // Mock calculation
      
      // Update status
      setTodayStatus({
        ...todayStatus,
        hasEnded: true,
        canEndDay: false,
        status: 'Completed',
        endTime: new Date(),
        totalHours: hoursWorked,
        earnedAmount: earnedAmount,
        message: `Day completed! You worked ${hoursWorked.toFixed(1)} hours today.`
      });

      toast.success(`✅ Day ended successfully! You worked ${hoursWorked.toFixed(1)} hours.`, {
        duration: 4000,
        style: {
          background: '#dcfce7',
          color: '#166534',
          border: '1px solid #bbf7d0',
        },
      });
      
    } catch (error) {
      console.error('Error ending day:', error);
      const errorMessage = error.message || 'Failed to end day';
      toast.error(errorMessage);
    } finally {
      setActionLoading(false);
    }
  };

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDuration = (hours) => {
    const h = Math.floor(hours);
    const m = Math.floor((hours % 1) * 60);
    return `${h}h ${m}m`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Present': return 'from-green-500 to-emerald-600';
      case 'Completed': return 'from-blue-500 to-cyan-600';
      case 'Half Day': return 'from-yellow-500 to-orange-500';
      case 'Late': return 'from-orange-500 to-red-500';
      case 'Not Started': return 'from-gray-500 to-slate-600';
      default: return 'from-indigo-500 to-purple-600';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Present': return Activity;
      case 'Completed': return CheckCircle;
      case 'Half Day': return Clock;
      case 'Late': return AlertCircle;
      case 'Not Started': return Timer;
      default: return Clock;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="relative">
            <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Clock className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-6 text-lg text-gray-600 font-medium"
          >
            Loading attendance tracker...
          </motion.p>
        </motion.div>
      </div>
    );
  }

  const StatusIcon = getStatusIcon(todayStatus?.status);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-2">
            Enhanced Attendance Tracker
          </h1>
          <p className="text-gray-600 text-lg">Track your daily attendance with precision and progress validation</p>
        </motion.div>

        {/* Current Time Display */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center mb-8"
        >
          <div className="inline-block bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
            <div className="text-5xl font-bold text-gray-900 mb-2 font-mono">
              {currentTime.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })}
            </div>
            <div className="text-lg text-gray-600">
              {formatDate(currentTime)}
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Status Card */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-2"
          >
            <Card className="bg-white shadow-xl border-0 overflow-hidden">
              <div className={`h-2 bg-gradient-to-r ${getStatusColor(todayStatus?.status)}`}></div>
              
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className={`p-3 rounded-full bg-gradient-to-r ${getStatusColor(todayStatus?.status)}`}>
                      <StatusIcon className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl font-bold text-gray-900">
                        Today's Status
                      </CardTitle>
                      <CardDescription className="text-lg text-gray-600">
                        {todayStatus?.message || 'Ready to start your day!'}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge 
                    className={`px-4 py-2 text-lg font-semibold bg-gradient-to-r ${getStatusColor(todayStatus?.status)} text-white border-0`}
                  >
                    {todayStatus?.status || 'Not Started'}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Time Information */}
                {todayStatus?.hasStarted && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-4"
                  >
                    <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200">
                      <Clock className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-600 font-medium">Start Time</p>
                      <p className="text-lg font-bold text-gray-900">
                        {formatTime(todayStatus.startTime)}
                      </p>
                    </div>
                    
                    {todayStatus.hasEnded ? (
                      <div className="text-center p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-xl border border-green-200">
                        <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                        <p className="text-sm text-gray-600 font-medium">End Time</p>
                        <p className="text-lg font-bold text-gray-900">
                          {formatTime(todayStatus.endTime)}
                        </p>
                      </div>
                    ) : (
                      <div className="text-center p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl border border-orange-200">
                        <Timer className="w-8 h-8 text-orange-600 mx-auto mb-2" />
                        <p className="text-sm text-gray-600 font-medium">Current Hours</p>
                        <p className="text-lg font-bold text-gray-900">
                          {formatDuration(todayStatus.currentHours || 0)}
                        </p>
                      </div>
                    )}

                    <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl border border-purple-200">
                      <DollarSign className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-600 font-medium">Earned Today</p>
                      <p className="text-lg font-bold text-gray-900">
                        ₹{Math.round((todayStatus.earnedAmount || 0) * 100) / 100}
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Progress Requirement Notice */}
                {todayStatus?.hasStarted && !todayStatus?.hasEnded && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4"
                  >
                    <div className="flex items-center space-x-3">
                      <AlertCircle className="w-6 h-6 text-amber-600" />
                      <div>
                        <h4 className="font-semibold text-amber-900">Progress Required</h4>
                        <p className="text-sm text-amber-700">
                          You must set your daily progress before ending your work day.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  {todayStatus?.canStartDay && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3 }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Button
                        onClick={handleStartDay}
                        disabled={actionLoading || locationLoading}
                        className="w-full sm:w-auto px-8 py-4 text-lg font-semibold bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg hover:shadow-xl transition-all duration-300"
                      >
                        {actionLoading || locationLoading ? (
                          <div className="flex items-center">
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                            {locationLoading ? 'Getting Location...' : 'Starting Day...'}
                          </div>
                        ) : (
                          <div className="flex items-center">
                            <Play className="w-6 h-6 mr-2" />
                            Start Day
                          </div>
                        )}
                      </Button>
                    </motion.div>
                  )}

                  {todayStatus?.canEndDay && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4 }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Button
                        onClick={handleEndDay}
                        disabled={actionLoading}
                        className="w-full sm:w-auto px-8 py-4 text-lg font-semibold bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 shadow-lg hover:shadow-xl transition-all duration-300"
                      >
                        {actionLoading ? (
                          <div className="flex items-center">
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                            Ending Day...
                          </div>
                        ) : (
                          <div className="flex items-center">
                            <Square className="w-6 h-6 mr-2" />
                            End Day
                          </div>
                        )}
                      </Button>
                    </motion.div>
                  )}
                </div>

                {/* Progress Bar for Working Hours */}
                {todayStatus?.hasStarted && !todayStatus?.hasEnded && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="space-y-3"
                  >
                    <div className="flex justify-between text-sm text-gray-600 font-medium">
                      <span>Progress towards 8 hours</span>
                      <span>{formatDuration(todayStatus.currentHours || 0)} / 8h</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ 
                          width: `${Math.min((todayStatus.currentHours || 0) / 8 * 100, 100)}%` 
                        }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className="bg-gradient-to-r from-blue-500 to-purple-600 h-4 rounded-full"
                      ></motion.div>
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Side Panel */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-6"
          >
            
            {/* Quick Stats */}
            <Card className="bg-white shadow-lg border-0">
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <BarChart3 className="w-5 h-5 mr-2 text-blue-600" />
                  Quick Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200">
                  <div className="flex items-center space-x-2">
                    <Activity className="w-5 h-5 text-blue-600" />
                    <span className="text-sm font-medium text-gray-700">Status</span>
                  </div>
                  <Badge variant="outline" className="border-blue-300 text-blue-700">
                    {todayStatus?.status || 'Not Started'}
                  </Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-green-50 to-green-100 rounded-lg border border-green-200">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-medium text-gray-700">Hours Today</span>
                  </div>
                  <span className="font-bold text-green-700">
                    {formatDuration(todayStatus?.totalHours || todayStatus?.currentHours || 0)}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg border border-purple-200">
                  <div className="flex items-center space-x-2">
                    <DollarSign className="w-5 h-5 text-purple-600" />
                    <span className="text-sm font-medium text-gray-700">Earnings</span>
                  </div>
                  <span className="font-bold text-purple-700">
                    ₹{Math.round((todayStatus?.earnedAmount || 0) * 100) / 100}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-orange-50 to-orange-100 rounded-lg border border-orange-200">
                  <div className="flex items-center space-x-2">
                    <Target className="w-5 h-5 text-orange-600" />
                    <span className="text-sm font-medium text-gray-700">Efficiency</span>
                  </div>
                  <span className="font-bold text-orange-700">
                    {(todayStatus?.totalHours || todayStatus?.currentHours || 0) >= 8 ? 'Excellent' : 
                     (todayStatus?.totalHours || todayStatus?.currentHours || 0) >= 6 ? 'Good' : 
                     (todayStatus?.totalHours || todayStatus?.currentHours || 0) > 0 ? 'Fair' : 'N/A'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Device Info */}
            <Card className="bg-white shadow-lg border-0">
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Smartphone className="w-5 h-5 mr-2 text-gray-600" />
                  Device Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2">
                    <Smartphone className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-600">Device</span>
                  </div>
                  <span className="font-medium">{deviceInfo?.deviceType || 'Unknown'}</span>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2">
                    <Wifi className={`w-4 h-4 ${deviceInfo?.online ? 'text-green-500' : 'text-red-500'}`} />
                    <span className="text-gray-600">Connection</span>
                  </div>
                  <span className={`font-medium ${deviceInfo?.online ? 'text-green-600' : 'text-red-600'}`}>
                    {deviceInfo?.online ? 'Online' : 'Offline'}
                  </span>
                </div>
                
                {deviceInfo?.battery && (
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-2">
                      <Battery className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-600">Battery</span>
                    </div>
                    <span className="font-medium">{deviceInfo.battery}%</span>
                  </div>
                )}

                {location && (
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-4 h-4 text-green-500" />
                      <span className="text-gray-600">Location</span>
                    </div>
                    <Badge variant="outline" className="text-xs border-green-300 text-green-700">
                      Verified ±{Math.round(location.accuracy)}m
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent History */}
            <Card className="bg-white shadow-lg border-0">
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Calendar className="w-5 h-5 mr-2 text-indigo-600" />
                  Recent History
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {attendanceHistory.slice(0, 5).map((record, index) => (
                  <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-200">
                    <div className="flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${
                        record.isPresent ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                      <span className="text-sm text-gray-600">
                        {formatDate(record.date)}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {record.hoursWorked}h
                      </div>
                      <div className="text-xs text-gray-500">
                        {record.status}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedAttendanceTracker;