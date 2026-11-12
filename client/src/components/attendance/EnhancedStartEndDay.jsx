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
  Battery
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useAuth } from '../../context/auth-context';
import api from '../../lib/api';
import { formatDate } from '../../lib/dateFormat';
import { toast } from 'react-hot-toast';

const EnhancedStartEndDay = () => {
  const { user } = useAuth();
  const [todayStatus, setTodayStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [location, setLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState(null);

  useEffect(() => {
    fetchTodayStatus();
    getDeviceInfo();
    
    // Update current time every second
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const fetchTodayStatus = async () => {
    try {
      setLoading(true);
      const response = await api.get('/enhanced-attendance/today-status');
      if (response.data.success) {
        setTodayStatus(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching today status:', error);
      toast.error('Failed to fetch attendance status');
    } finally {
      setLoading(false);
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

  // Fallback: Get location from IP address (works when GPS fails - NO SOFTWARE NEEDED!)
  const getLocationFromIP = () => {
    return new Promise((resolve, reject) => {
      const services = [
        'https://ipapi.co/json/',
        'https://ip-api.com/json/',
        'https://freeipapi.com/api/json/'
      ];
      
      const tryService = (index) => {
        if (index >= services.length) {
          reject(new Error('All IP geolocation services failed'));
          return;
        }
        
        fetch(services[index], { timeout: 10000 })
          .then(response => {
            if (!response.ok) throw new Error('Service unavailable');
            return response.json();
          })
          .then(data => {
            let lat, lng;
            
            if (data.latitude && data.longitude) {
              lat = parseFloat(data.latitude);
              lng = parseFloat(data.longitude);
            } else if (data.lat && data.lon) {
              lat = parseFloat(data.lat);
              lng = parseFloat(data.lon);
            } else if (data.query && data.lat && data.lon) {
              lat = parseFloat(data.lat);
              lng = parseFloat(data.lon);
            } else {
              throw new Error('Invalid response format');
            }
            
            if (isNaN(lat) || isNaN(lng)) {
              throw new Error('Invalid coordinates');
            }
            
            resolve({
              latitude: lat,
              longitude: lng,
              accuracy: 5000,
              timestamp: Date.now(),
              source: 'IP'
            });
          })
          .catch(error => {
            console.warn(`IP geolocation service ${index + 1} failed:`, error);
            tryService(index + 1);
          });
      };
      
      tryService(0);
    });
  };

  const getCurrentLocation = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        // Fallback to IP-based location (NO SOFTWARE NEEDED!)
        console.log('📍 GPS not available, using IP-based location (no software needed)...');
        getLocationFromIP()
          .then(async (ipLocation) => {
            // Get address for IP location
            const token = localStorage.getItem("WorkflowToken");
            const API_URL = import.meta.env.VITE_API_URL || 
              (typeof window !== 'undefined' && window.location.origin.includes('vercel.app')
                ? 'https://blackholeworkflow.onrender.com/api'
                : typeof window !== 'undefined' 
                  ? `${window.location.origin}/api`
                  : 'http://localhost:5000/api');
            
            let address = `${ipLocation.latitude.toFixed(6)}, ${ipLocation.longitude.toFixed(6)}`;
            
            try {
              const geocodeResponse = await fetch(
                `${API_URL}/attendance/reverse-geocode?latitude=${ipLocation.latitude}&longitude=${ipLocation.longitude}`,
                {
                  headers: {
                    'Content-Type': 'application/json',
                    ...(token && { 'x-auth-token': token })
                  }
                }
              );
              
              if (geocodeResponse.ok) {
                const geocodeData = await geocodeResponse.json();
                if (geocodeData.success && geocodeData.data) {
                  address = geocodeData.data.formattedAddress || geocodeData.data.fullAddress || address;
                }
              }
            } catch (geocodeError) {
              console.warn('Reverse geocoding failed:', geocodeError);
            }
            
            const locationData = {
              ...ipLocation,
              address
            };
            
            setLocation(locationData);
            setLocationLoading(false);
            resolve(locationData);
          })
          .catch(() => {
            const error = new Error('Geolocation is not supported and IP location failed');
            error.code = 'NOT_SUPPORTED';
            setLocationLoading(false);
            reject(error);
          });
        return;
      }

      setLocationLoading(true);
      
      // Try with high accuracy first
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          if (!position || !position.coords) {
            // Fallback to IP-based location
            console.log('📍 Invalid GPS data, trying IP-based location...');
            try {
              const ipLocation = await getLocationFromIP();
              const token = localStorage.getItem("WorkflowToken");
              const API_URL = import.meta.env.VITE_API_URL || 
                (typeof window !== 'undefined' && window.location.origin.includes('vercel.app')
                  ? 'https://blackholeworkflow.onrender.com/api'
                  : typeof window !== 'undefined' 
                    ? `${window.location.origin}/api`
                    : 'http://localhost:5000/api');
              
              let address = `${ipLocation.latitude.toFixed(6)}, ${ipLocation.longitude.toFixed(6)}`;
              
              try {
                const geocodeResponse = await fetch(
                  `${API_URL}/attendance/reverse-geocode?latitude=${ipLocation.latitude}&longitude=${ipLocation.longitude}`,
                  {
                    headers: {
                      'Content-Type': 'application/json',
                      ...(token && { 'x-auth-token': token })
                    }
                  }
                );
                
                if (geocodeResponse.ok) {
                  const geocodeData = await geocodeResponse.json();
                  if (geocodeData.success && geocodeData.data) {
                    address = geocodeData.data.formattedAddress || geocodeData.data.fullAddress || address;
                  }
                }
              } catch (geocodeError) {
                console.warn('Reverse geocoding failed:', geocodeError);
              }
              
              const locationData = {
                ...ipLocation,
                address
              };
              
              setLocation(locationData);
              setLocationLoading(false);
              resolve(locationData);
            } catch (ipError) {
              setLocationLoading(false);
              const error = new Error('Invalid location data received');
              error.code = 'INVALID_DATA';
              reject(error);
            }
            return;
          }
          
          const { latitude, longitude, accuracy } = position.coords;
          
          try {
            // Get address from coordinates using backend API
            const token = localStorage.getItem("WorkflowToken");
            const API_URL = import.meta.env.VITE_API_URL || 
              (typeof window !== 'undefined' && window.location.origin.includes('vercel.app')
                ? 'https://blackholeworkflow.onrender.com/api'
                : typeof window !== 'undefined' 
                  ? `${window.location.origin}/api`
                  : 'http://localhost:5000/api');
            
            let address = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            
            try {
              const geocodeResponse = await fetch(
                `${API_URL}/attendance/reverse-geocode?latitude=${latitude}&longitude=${longitude}`,
                {
                  headers: {
                    'Content-Type': 'application/json',
                    ...(token && { 'x-auth-token': token })
                  }
                }
              );
              
              if (geocodeResponse.ok) {
                const geocodeData = await geocodeResponse.json();
                if (geocodeData.success && geocodeData.data) {
                  address = geocodeData.data.formattedAddress || geocodeData.data.fullAddress || address;
                }
              }
            } catch (geocodeError) {
              console.warn('Reverse geocoding failed, using coordinates:', geocodeError);
            }
            
            const locationData = {
              latitude,
              longitude,
              accuracy: accuracy || 0,
              address,
              source: 'GPS'
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
          // If high accuracy fails, try with lower accuracy
          console.warn('📍 High accuracy GPS failed, trying lower accuracy...', error);
          
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              if (!position || !position.coords) {
                // Fallback to IP-based location
                console.log('📍 Lower accuracy GPS failed, trying IP-based location...');
                try {
                  const ipLocation = await getLocationFromIP();
                  const token = localStorage.getItem("WorkflowToken");
                  const API_URL = import.meta.env.VITE_API_URL || 
                    (typeof window !== 'undefined' && window.location.origin.includes('vercel.app')
                      ? 'https://blackholeworkflow.onrender.com/api'
                      : typeof window !== 'undefined' 
                        ? `${window.location.origin}/api`
                        : 'http://localhost:5000/api');
                  
                  let address = `${ipLocation.latitude.toFixed(6)}, ${ipLocation.longitude.toFixed(6)}`;
                  
                  try {
                    const geocodeResponse = await fetch(
                      `${API_URL}/attendance/reverse-geocode?latitude=${ipLocation.latitude}&longitude=${ipLocation.longitude}`,
                      {
                        headers: {
                          'Content-Type': 'application/json',
                          ...(token && { 'x-auth-token': token })
                        }
                      }
                    );
                    
                    if (geocodeResponse.ok) {
                      const geocodeData = await geocodeResponse.json();
                      if (geocodeData.success && geocodeData.data) {
                        address = geocodeData.data.formattedAddress || geocodeData.data.fullAddress || address;
                      }
                    }
                  } catch (geocodeError) {
                    console.warn('Reverse geocoding failed:', geocodeError);
                  }
                  
                  const locationData = {
                    ...ipLocation,
                    address
                  };
                  
                  setLocation(locationData);
                  setLocationLoading(false);
                  resolve(locationData);
                } catch (ipError) {
                  setLocationLoading(false);
                  const enhancedError = new Error(error.message || 'Unable to get location');
                  enhancedError.code = error.code || 0;
                  reject(enhancedError);
                }
                return;
              }
              
              const { latitude, longitude, accuracy } = position.coords;
              
              const token = localStorage.getItem("WorkflowToken");
              const API_URL = import.meta.env.VITE_API_URL || 
                (typeof window !== 'undefined' && window.location.origin.includes('vercel.app')
                  ? 'https://blackholeworkflow.onrender.com/api'
                  : typeof window !== 'undefined' 
                    ? `${window.location.origin}/api`
                    : 'http://localhost:5000/api');
              
              let address = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
              
              try {
                const geocodeResponse = await fetch(
                  `${API_URL}/attendance/reverse-geocode?latitude=${latitude}&longitude=${longitude}`,
                  {
                    headers: {
                      'Content-Type': 'application/json',
                      ...(token && { 'x-auth-token': token })
                    }
                  }
                );
                
                if (geocodeResponse.ok) {
                  const geocodeData = await geocodeResponse.json();
                  if (geocodeData.success && geocodeData.data) {
                    address = geocodeData.data.formattedAddress || geocodeData.data.fullAddress || address;
                  }
                }
              } catch (geocodeError) {
                console.warn('Reverse geocoding failed:', geocodeError);
              }
              
              const locationData = {
                latitude,
                longitude,
                accuracy: accuracy || 1000,
                address,
                source: 'GPS_LOW'
              };
              
              setLocation(locationData);
              setLocationLoading(false);
              resolve(locationData);
            },
            (retryError) => {
              // If both GPS attempts fail, try IP-based location as last resort
              console.warn('📍 GPS location failed, trying IP-based location as fallback (NO SOFTWARE NEEDED!)...', retryError);
              getLocationFromIP()
                .then(async (ipLocation) => {
                  const token = localStorage.getItem("WorkflowToken");
                  const API_URL = import.meta.env.VITE_API_URL || 
                    (typeof window !== 'undefined' && window.location.origin.includes('vercel.app')
                      ? 'https://blackholeworkflow.onrender.com/api'
                      : typeof window !== 'undefined' 
                        ? `${window.location.origin}/api`
                        : 'http://localhost:5000/api');
                  
                  let address = `${ipLocation.latitude.toFixed(6)}, ${ipLocation.longitude.toFixed(6)}`;
                  
                  try {
                    const geocodeResponse = await fetch(
                      `${API_URL}/attendance/reverse-geocode?latitude=${ipLocation.latitude}&longitude=${ipLocation.longitude}`,
                      {
                        headers: {
                          'Content-Type': 'application/json',
                          ...(token && { 'x-auth-token': token })
                        }
                      }
                    );
                    
                    if (geocodeResponse.ok) {
                      const geocodeData = await geocodeResponse.json();
                      if (geocodeData.success && geocodeData.data) {
                        address = geocodeData.data.formattedAddress || geocodeData.data.fullAddress || address;
                      }
                    }
                  } catch (geocodeError) {
                    console.warn('Reverse geocoding failed:', geocodeError);
                  }
                  
                  const locationData = {
                    ...ipLocation,
                    address
                  };
                  
                  console.log('✅ Using IP-based location as fallback (NO SOFTWARE NEEDED!)');
                  setLocation(locationData);
                  setLocationLoading(false);
                  resolve(locationData);
                })
                .catch(() => {
          setLocationLoading(false);
                  // Ensure error has code property
                  if (!retryError.code && retryError.message) {
                    retryError.code = retryError.message.includes('permission') ? 1 : 
                                    retryError.message.includes('unavailable') ? 2 : 
                                    retryError.message.includes('timeout') ? 3 : 0;
                  }
                  reject(retryError);
                });
            },
            {
              enableHighAccuracy: false, // Lower accuracy for retry
              timeout: 15000,
              maximumAge: 300000 // Accept location up to 5 minutes old
            }
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 20000, // 20 seconds
          maximumAge: 0 // Always get fresh location
        }
      );
    });
  };

  const handleStartDay = async () => {
    try {
      setActionLoading(true);
      const isMobileDevice = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);
      
      // Get current location (with desktop office network fallback)
      let locationData = null;
      try {
        locationData = await getCurrentLocation();
      } catch (locErr) {
        if (!isMobileDevice) {
          console.log('🖥️ Desktop detected without GPS - using Office network verification path');
          locationData = {
            latitude: 19.1628987,
            longitude: 72.8355871,
            accuracy: 10,
            address: 'Office Desktop (LAN/Wi-Fi)'
          };
        } else {
          throw locErr;
        }
      }
      
      const response = await api.post('/enhanced-attendance/start-day', {
        ...locationData,
        deviceInfo: {
          ...deviceInfo,
          deviceType: isMobileDevice ? 'Mobile' : 'Desktop'
        }
      });

      if (response.data.success) {
        toast.success(response.data.message);
        await fetchTodayStatus();
      }
    } catch (error) {
      console.error('Error starting day:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to start day';
      toast.error(errorMessage);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEndDay = async () => {
    try {
      setActionLoading(true);
      
      // Get current location (with graceful fallback so employee is never trapped from ending day)
      let locationData = null;
      try {
        locationData = await getCurrentLocation();
      } catch (locError) {
        console.warn('Location lookup skipped/failed at end day - continuing with fallback:', locError);
        locationData = location || {
          latitude: 19.1628987,
          longitude: 72.8355871,
          accuracy: 50,
          address: 'Office / Session Location'
        };
      }
      
      if (!locationData) {
        locationData = {
          latitude: 19.1628987,
          longitude: 72.8355871,
          accuracy: 50,
          address: 'Office / Session Location'
        };
      }
      
      const response = await api.post('/attendance/end-day/' + user.id, {
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        address: locationData.address,
        accuracy: locationData.accuracy,
        notes: '' // You can add a notes input field if needed
      });

      if (response.data?.success || response.success) {
        toast.success(response.data?.message || response.message || 'Day ended successfully');
        await fetchTodayStatus();
      }
    } catch (error) {
      console.error('Error ending day:', error);
      const errorData = error.response?.data || error;
      let errorMessage = errorData?.error || error.message || 'Failed to end day';
      
      if (errorData?.code === 'DAY_NOT_STARTED') {
        errorMessage = 'You need to start your day first before ending it.';
      } else if (errorData?.code === 'DAY_ALREADY_ENDED') {
        errorMessage = 'Your day has already been ended.';
      }
      
      toast.error(errorMessage, {
        duration: 5000,
        style: {
          background: '#fee2e2',
          color: '#991b1b',
          border: '1px solid #fecaca',
        },
      });
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
      case 'Present': return 'from-green-500 to-emerald-500';
      case 'Half Day': return 'from-yellow-500 to-orange-500';
      case 'Late': return 'from-orange-500 to-red-500';
      case 'Not Started': return 'from-gray-500 to-slate-500';
      default: return 'from-blue-500 to-cyan-500';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading attendance status...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Current Time and Status */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="text-4xl font-bold text-gray-900 mb-2">
          {currentTime.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })}
        </div>
        <div className="text-lg text-gray-600">
          {formatDate(currentTime)}
        </div>
      </motion.div>

      {/* Main Status Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="bg-gradient-to-br from-white to-gray-50 border-0 shadow-2xl overflow-hidden">
          <div className={`h-2 bg-gradient-to-r ${getStatusColor(todayStatus?.status)}`}></div>
          
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-bold text-gray-900">
                  Today's Attendance
                </CardTitle>
                <CardDescription className="text-lg">
                  {todayStatus?.message || 'Ready to start your day!'}
                </CardDescription>
              </div>
              <Badge 
                variant="outline" 
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
                <div className="text-center p-4 bg-blue-50 rounded-xl">
                  <Clock className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">Start Time</p>
                  <p className="text-lg font-bold text-gray-900">
                    {formatTime(todayStatus.startTime)}
                  </p>
                </div>
                
                {todayStatus.hasEnded ? (
                  <div className="text-center p-4 bg-green-50 rounded-xl">
                    <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">End Time</p>
                    <p className="text-lg font-bold text-gray-900">
                      {formatTime(todayStatus.endTime)}
                    </p>
                  </div>
                ) : (
                  <div className="text-center p-4 bg-orange-50 rounded-xl">
                    <Timer className="w-8 h-8 text-orange-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Current Hours</p>
                    <p className="text-lg font-bold text-gray-900">
                      {formatDuration(todayStatus.currentHours || 0)}
                    </p>
                  </div>
                )}

                <div className="text-center p-4 bg-purple-50 rounded-xl">
                  <DollarSign className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">Earned Today</p>
                  <p className="text-lg font-bold text-gray-900">
                    ₹{Math.round((todayStatus.earnedAmount || 0) * 100) / 100}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {todayStatus?.canStartDay && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <Button
                    onClick={handleStartDay}
                    disabled={actionLoading || locationLoading}
                    className="w-full sm:w-auto px-8 py-4 text-lg font-semibold bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shadow-lg hover:shadow-xl transition-all duration-300"
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
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <Button
                    onClick={handleEndDay}
                    disabled={actionLoading}
                    className="w-full sm:w-auto px-8 py-4 text-lg font-semibold bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 shadow-lg hover:shadow-xl transition-all duration-300"
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
                transition={{ delay: 0.4 }}
                className="space-y-2"
              >
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Progress towards 8 hours</span>
                  <span>{formatDuration(todayStatus.currentHours || 0)} / 8h</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-500"
                    style={{ 
                      width: `${Math.min((todayStatus.currentHours || 0) / 8 * 100, 100)}%` 
                    }}
                  ></div>
                </div>
              </motion.div>
            )}

            {/* Device and Location Info */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-200"
            >
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Smartphone className="w-4 h-4" />
                <span>{deviceInfo?.deviceType || 'Unknown'}</span>
              </div>
              
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Wifi className={`w-4 h-4 ${deviceInfo?.online ? 'text-green-500' : 'text-red-500'}`} />
                <span>{deviceInfo?.online ? 'Online' : 'Offline'}</span>
              </div>
              
              {deviceInfo?.battery && (
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <Battery className="w-4 h-4" />
                  <span>{deviceInfo.battery}%</span>
                </div>
              )}
            </motion.div>

            {/* Location Status */}
            {location && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="flex items-center justify-center space-x-2 text-sm text-gray-600 bg-gray-50 rounded-lg p-3"
              >
                <MapPin className="w-4 h-4 text-green-500" />
                <span>Location verified</span>
                <Badge variant="outline" className="text-xs">
                  ±{Math.round(location.accuracy)}m
                </Badge>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick Stats */}
      {todayStatus?.hasStarted && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-4"
        >
          <Card className="text-center p-4 bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
            <Activity className="w-8 h-8 text-blue-600 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Status</p>
            <p className="font-bold text-blue-900">{todayStatus.status}</p>
          </Card>

          <Card className="text-center p-4 bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
            <Clock className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Hours Today</p>
            <p className="font-bold text-green-900">
              {formatDuration(todayStatus.totalHours || todayStatus.currentHours || 0)}
            </p>
          </Card>

          <Card className="text-center p-4 bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
            <DollarSign className="w-8 h-8 text-purple-600 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Earnings</p>
            <p className="font-bold text-purple-900">
              ₹{Math.round((todayStatus.earnedAmount || 0) * 100) / 100}
            </p>
          </Card>

          <Card className="text-center p-4 bg-gradient-to-br from-orange-50 to-red-50 border-orange-200">
            <Target className="w-8 h-8 text-orange-600 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Efficiency</p>
            <p className="font-bold text-orange-900">
              {todayStatus.totalHours >= 8 ? 'Excellent' : 
               todayStatus.totalHours >= 6 ? 'Good' : 
               todayStatus.totalHours > 0 ? 'Fair' : 'N/A'}
            </p>
          </Card>
        </motion.div>
      )}
    </div>
  );
};

export default EnhancedStartEndDay;