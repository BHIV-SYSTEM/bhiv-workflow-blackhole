import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin,
  Home,
  Building,
  Wifi,
  WifiOff,
  Battery,
  Signal,
  AlertTriangle,
  CheckCircle,
  Clock,
  Navigation,
  MapPinned,
  Smartphone,
  Target,
  Star
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { useAuth } from '../../context/auth-context';
import api from '../../lib/api';
import { toast } from 'react-hot-toast';

const OFFICE_COORDINATES = {
  latitude: 19.160122,
  longitude: 72.839720
};
const OFFICE_RADIUS = 2000; // meters
const OFFICE_ADDRESS = 'Blackhole Infiverse LLP, Road Number 3, near Hathi Circle, above Bright Connection, Kala Galli, Motilal Nagar II, Goregaon West, Mumbai, Maharashtra';

const EnhancedStartDayDialog = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [step, setStep] = useState('location'); // location, validation, confirmation
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [workFromHome, setWorkFromHome] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState({});
  const [isInOfficeRange, setIsInOfficeRange] = useState(false);
  const [distanceFromOffice, setDistanceFromOffice] = useState(null);
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    if (isOpen) {
      initializeDialog();
      getDeviceInfo();
      getBatteryInfo();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const initializeDialog = () => {
    setStep('location');
    setLoading(false);
    setLocation(null);
    setLocationError(null);
    setWorkFromHome(false);
    setIsInOfficeRange(false);
    setDistanceFromOffice(null);
  };

  const getDeviceInfo = () => {
    const info = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      screen: {
        width: screen.width,
        height: screen.height,
        colorDepth: screen.colorDepth
      },
      timestamp: new Date().toISOString()
    };
    setDeviceInfo(info);
  };

  const getBatteryInfo = async () => {
    try {
      if ('getBattery' in navigator) {
        const battery = await navigator.getBattery();
        setBatteryLevel(Math.round(battery.level * 100));
      }
    } catch (error) {
      console.warn('Battery API not supported:', error);
    }
  };

  // Fallback: Get location from IP address (works when GPS fails)
  const getLocationFromIP = () => {
    return new Promise((resolve, reject) => {
      // Try multiple free IP geolocation services
      const services = [
        'https://ipapi.co/json/',
        'https://ip-api.com/json/',
        'https://freeipapi.com/api/json/'
      ];
      
      let attempts = 0;
      
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
            
            // Parse response based on service format
            if (data.latitude && data.longitude) {
              lat = parseFloat(data.latitude);
              lng = parseFloat(data.longitude);
            } else if (data.lat && data.lon) {
              lat = parseFloat(data.lat);
              lng = parseFloat(data.lon);
            } else if (data.query && data.lat && data.lon) {
              // ip-api.com format
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
              accuracy: 5000, // IP-based location is less accurate (~5km radius)
              timestamp: Date.now(),
              source: 'IP'
            });
          })
          .catch(error => {
            console.warn(`IP geolocation service ${index + 1} failed:`, error);
            tryService(index + 1); // Try next service
          });
      };
      
      tryService(0);
    });
  };

  const getCurrentLocation = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        // Fallback to IP-based location if geolocation not supported
        console.log('Geolocation not supported, using IP-based location...');
        getLocationFromIP()
          .then(resolve)
          .catch(() => {
            const error = new Error('Geolocation is not supported and IP location failed');
            error.code = 'NOT_SUPPORTED';
            reject(error);
          });
        return;
      }

      setLoading(true);
      
      // Try with high accuracy first
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!position || !position.coords) {
            // Fallback to IP-based location
            console.log('Invalid GPS data, trying IP-based location...');
            getLocationFromIP()
              .then((ipLocation) => {
                setLoading(false);
                resolve(ipLocation);
              })
              .catch(() => {
                setLoading(false);
                const error = new Error('Invalid location data received');
                error.code = 'INVALID_DATA';
                reject(error);
              });
            return;
          }
          
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy || 0,
            timestamp: position.timestamp,
            source: 'GPS'
          };
          setLoading(false);
          resolve(coords);
        },
        (error) => {
          // Log the error details for debugging (but don't show to user yet)
          // This GeolocationPositionError is expected when GPS fails - we'll use IP fallback
          console.log('📍 GPS Error (this is normal - switching to IP fallback):', {
            code: error.code,
            message: error.message,
            type: 'GeolocationPositionError',
            note: 'IP-based location will be used automatically'
          });
          
          // If high accuracy fails, try with lower accuracy first
          console.log('📍 Trying lower accuracy GPS...');
          
          navigator.geolocation.getCurrentPosition(
            (position) => {
              if (!position || !position.coords) {
                // Fallback to IP-based location
                console.log('📍 Lower accuracy GPS failed, trying IP-based location...');
                getLocationFromIP()
                  .then((ipLocation) => {
                    setLoading(false);
                    console.log('✅ Using IP-based location (GPS unavailable)');
                    resolve(ipLocation);
                  })
                  .catch(() => {
                    setLoading(false);
                    const enhancedError = new Error(error.message || 'Unable to get location');
                    enhancedError.code = error.code || 0;
                    reject(enhancedError);
                  });
                return;
              }
              
              const coords = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy || 1000, // Lower accuracy
                timestamp: position.timestamp,
                source: 'GPS_LOW'
              };
              setLoading(false);
              console.log('✅ Using lower accuracy GPS');
              resolve(coords);
            },
            (retryError) => {
              // If both GPS attempts fail, automatically try IP-based location
              // This is the expected behavior - GPS failed, so we use IP
              console.log('📍 GPS unavailable (this is OK - using IP location automatically):', {
                code: retryError.code,
                message: retryError.message,
                action: 'Switching to IP-based location...'
              });
              
              // Automatically use IP fallback - don't reject immediately
              // This is the normal flow when GPS fails
              getLocationFromIP()
                .then((ipLocation) => {
                  setLoading(false);
                  console.log('✅ Successfully using IP-based location (GPS was unavailable - this is normal)');
                  resolve(ipLocation); // Resolve with IP location instead of rejecting
                })
                .catch((ipError) => {
                  setLoading(false);
                  // Only reject if IP also fails (rare case)
                  console.error('❌ Both GPS and IP location failed (unusual):', ipError);
                  const finalError = new Error(
                    retryError.code === 1 ? 'Location permission denied. Please enable location access.' :
                    retryError.code === 2 ? 'Location unavailable. Please check your GPS/WiFi settings.' :
                    retryError.code === 3 ? 'Location request timed out. IP-based location also failed. Please check your internet connection.' :
                    'Unable to get your location. Please check your internet connection.'
                  );
                  finalError.code = retryError.code || 0;
                  reject(finalError);
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

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return Math.round(R * c);
  };

  const handleGetLocation = async () => {
    const isMobileDevice = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);
    try {
      setLoading(true);
      setLocationError(null);
      
      let coords;
      try {
        coords = await getCurrentLocation();
      } catch (locErr) {
        // If on Desktop PC (which lacks physical GPS), use office coordinates as initial placement
        // and let backend verify via Office Network IP
        if (!isMobileDevice) {
          console.log('🖥️ Desktop detected without GPS - using Office network verification path');
          coords = {
            latitude: OFFICE_COORDINATES.latitude,
            longitude: OFFICE_COORDINATES.longitude,
            accuracy: 10,
            source: 'Desktop-LAN'
          };
        } else {
          throw locErr;
        }
      }
      
      // Calculate distance from office
      const distance = calculateDistance(
        coords.latitude,
        coords.longitude,
        OFFICE_COORDINATES.latitude,
        OFFICE_COORDINATES.longitude
      );
      
      const inRange = distance <= OFFICE_RADIUS;
      setLocation(coords);
      setDistanceFromOffice(distance);
      setIsInOfficeRange(inRange);
      // Auto-select Work From Home if outside office radius (allowed: 2000m)
      if (!inRange) {
        setWorkFromHome(true);
      } else {
        setWorkFromHome(false);
      }
      setStep('validation');
      
    } catch (error) {
      // Log error details for debugging (but don't show raw error to user)
      console.log('📍 Location Error Details:', {
        code: error.code,
        message: error.message,
        type: error.constructor?.name || 'Error'
      });
      
      let errorMessage = 'Unable to get your location. ';
      let errorTitle = 'Location Error';
      
      // Handle GeolocationPositionError
      // Note: The IP fallback should have already been tried automatically
      if (error.code !== undefined) {
      switch (error.code) {
          case 1: // PERMISSION_DENIED
        case error.PERMISSION_DENIED:
            errorTitle = 'Location Permission Denied';
            errorMessage = 'Location access is denied. Please enable location permission in your browser settings. The system tried to use IP-based location as a fallback, but it also failed.';
          break;
          case 2: // POSITION_UNAVAILABLE
        case error.POSITION_UNAVAILABLE:
            errorTitle = 'Location Unavailable';
            errorMessage = 'Your location could not be determined. The system automatically tried IP-based location, but it also failed. Please check your internet connection.';
          break;
          case 3: // TIMEOUT
        case error.TIMEOUT:
            errorTitle = 'Location Timeout';
            errorMessage = 'GPS location timed out. The system automatically tried IP-based location, but it also failed. Please check your internet connection and try again.';
          break;
        default:
            errorTitle = 'Location Error';
            errorMessage = error.message || 'Unable to get your location. The system tried both GPS and IP-based location, but both failed. Please check your internet connection and try again.';
          break;
      }
      } else if (error.message) {
        // Handle other error types
        if (error.message.includes('not supported')) {
          errorTitle = 'Geolocation Not Supported';
          errorMessage = 'Your browser does not support geolocation. Please use a modern browser.';
        } else if (error.message.includes('permission')) {
          errorTitle = 'Permission Required';
          errorMessage = 'Please allow location access to start your day.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setLocationError(`${errorTitle}: ${errorMessage}`);
      toast.error(`${errorTitle}: ${errorMessage}`, {
        duration: 6000,
        style: {
          background: '#fee2e2',
          color: '#991b1b',
          border: '1px solid #fecaca',
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStartDay = async () => {
    if (!location) {
      toast.error('Please get your location first');
      return;
    }

    if (!workFromHome && !isInOfficeRange) {
      toast.error(`You are outside office range (${distanceFromOffice ? Math.round(distanceFromOffice / 1000) + 'km away' : ''}). Please select Work From Home.`);
      setWorkFromHome(true);
      return;
    }

    try {
      setLoading(true);
      
      const isMobileDevice = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);
      const startDayData = {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        workFromHome,
        workLocation: workFromHome ? 'Home' : 'Office',
        address: workFromHome ? 'Work From Home' : 'Blackhole Infiverse LLP Office',
        deviceInfo: {
          ...deviceInfo,
          deviceType: isMobileDevice ? 'Mobile' : 'Desktop'
        }
      };

      const response = await api.attendance.startDay(user.id, startDayData);
      
      if (response.success) {
        toast.success(response.message, {
          duration: 4000,
          style: {
            background: '#dcfce7',
            color: '#166534',
            border: '1px solid #bbf7d0',
          },
        });
        
        onSuccess && onSuccess(response);
        onClose();

        setTimeout(() => {
          window.location.reload();
        }, 4000); // same as toast duration
      }
      
    } catch (error) {
      console.error('Start day error:', error);
      const errorData = error.response?.data;
      
      if (errorData?.code === 'LOCATION_TOO_FAR') {
        toast.error('You are too far from office. Please go to office or select "Work From Home"', {
          duration: 6000,
        });
      } else if (errorData?.code === 'DAY_ALREADY_STARTED') {
        toast.error('Your day has already been started');
        onClose();
      } else {
        toast.error(errorData?.error || 'Failed to start day');
      }
    } finally {
      setLoading(false);
    }
  };

  const getLocationStatusColor = () => {
    if (!location) return 'bg-gray-500';
    if (workFromHome) return 'bg-blue-500';
    if (isInOfficeRange) return 'bg-green-500';
    return 'bg-red-500';
  };

  const getLocationStatusText = () => {
    if (!location) return 'Location not detected';
    if (workFromHome) return 'Work From Home';
    if (isInOfficeRange) return 'At Blackhole Office';
    return 'Outside office range';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto bg-gray-800/95 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl">
        <DialogHeader className="relative pb-2">
          <DialogTitle className="text-lg font-semibold text-white">
            Start Your Work Day
          </DialogTitle>
          <DialogDescription className="text-gray-300 dark:text-gray-400 text-sm">
            Verify your location and start tracking your work hours
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Device Status Bar */}
          <div className="bg-gray-600/50 dark:bg-gray-700/50 backdrop-blur-sm rounded-xl p-3 shadow-lg border border-gray-500/30 dark:border-gray-600/30">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-1">
                  {isOnline ? (
                    <Wifi className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <WifiOff className="w-3.5 h-3.5 text-red-400" />
                  )}
                  <span className={`font-semibold ${isOnline ? 'text-green-400' : 'text-red-400'}`}>
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
                
                {batteryLevel !== null && (
                  <div className="flex items-center space-x-1">
                    <Battery className="w-3.5 h-3.5 text-white" />
                    <span className="font-semibold text-white">{batteryLevel}%</span>
                  </div>
                )}
                
                <div className="flex items-center space-x-1">
                  <Smartphone className="w-3.5 h-3.5 text-white" />
                  <span className="font-semibold text-white">{deviceInfo.platform || 'Win32'}</span>
                </div>
              </div>
              
              <div className="flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-white" />
                <span className="font-bold text-white">{new Date().toLocaleTimeString()}</span>
              </div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {/* Step 1: Location Detection */}
            {step === 'location' && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="text-center py-6">
                  <div className="inline-block p-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl shadow-xl mb-4">
                    <MapPin className="w-20 h-20 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2 text-white">
                    Location Required
                  </h3>
                  <p className="text-gray-300 dark:text-gray-400 text-sm max-w-sm mx-auto">
                    We need to verify your location to start your work day
                  </p>
                </div>

                {locationError && (
                  <div className="bg-red-900/30 backdrop-blur-sm border border-red-500/30 rounded-xl p-4 shadow-lg">
                    <div className="flex items-start space-x-3">
                      <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="font-semibold text-red-300 text-base">Location Error</h4>
                        <p className="text-sm text-red-200 mt-1">{locationError}</p>
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleGetLocation}
                  disabled={loading}
                  className="w-full h-12 text-base bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200 font-semibold rounded-xl"
                >
                  {loading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Getting Location...</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <Navigation className="w-5 h-5" />
                      <span>Get My Location</span>
                    </div>
                  )}
                </Button>
              </motion.div>
            )}

            {/* Step 2: Location Validation */}
            {step === 'validation' && location && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center py-6">
                  <div className="relative inline-block mb-4">
                    <div className={`absolute inset-0 ${getLocationStatusColor()} opacity-30 rounded-full blur-2xl animate-pulse`}></div>
                    <div className={`relative w-20 h-20 ${getLocationStatusColor()} rounded-full flex items-center justify-center shadow-2xl`}>
                      {workFromHome ? (
                        <Home className="w-10 h-10 text-white" />
                      ) : isInOfficeRange ? (
                        <CheckCircle className="w-10 h-10 text-white" />
                      ) : (
                        <AlertTriangle className="w-10 h-10 text-white" />
                      )}
                    </div>
                  </div>
                  
                  <h3 className="text-2xl font-bold mb-3 text-white">Location Detected</h3>
                  <Badge 
                    variant="outline" 
                    className={`px-5 py-2 text-sm font-bold shadow-lg backdrop-blur-sm border ${
                      workFromHome ? 'border-blue-400 text-blue-300 bg-blue-500/20' :
                      isInOfficeRange ? 'border-green-400 text-green-300 bg-green-500/20' : 
                      'border-red-400 text-red-300 bg-red-500/20'
                    }`}
                  >
                    {getLocationStatusText()}
                  </Badge>
                </div>

                {/* Location Details */}
                <div className="bg-gray-600/50 dark:bg-gray-700/50 backdrop-blur-sm rounded-xl p-4 shadow-lg border border-gray-500/30 dark:border-gray-600/30 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                      <Target className="w-4 h-4 text-blue-400" />
                      Coordinates:
                    </span>
                    <span className="text-sm font-mono font-bold text-blue-400">
                      {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                      <Navigation className="w-4 h-4 text-purple-400" />
                      Accuracy:
                    </span>
                    <span className="text-sm font-bold text-purple-400">±{Math.round(location.accuracy)}m</span>
                  </div>
                  
                  {distanceFromOffice !== null && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                        <MapPinned className="w-4 h-4 text-green-400" />
                        Distance from Office:
                      </span>
                      <span className="text-sm font-bold text-green-400">
                        {distanceFromOffice >= 1000 
                          ? `${(distanceFromOffice / 1000).toFixed(1)} km (${distanceFromOffice.toLocaleString()}m)`
                          : `${distanceFromOffice}m`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Office Range Validation */}
                {!workFromHome ? (
                  <div className={`relative overflow-hidden rounded-xl p-5 shadow-lg backdrop-blur-sm border ${
                    isInOfficeRange 
                      ? 'border-green-500/30 bg-green-600/20' 
                      : 'border-red-500/30 bg-red-600/20'
                  }`}>
                    <div className="flex items-start space-x-4">
                      <div className={`p-3 rounded-2xl shadow-lg ${
                        isInOfficeRange 
                          ? 'bg-green-500' 
                          : 'bg-red-500'
                      }`}>
                        {isInOfficeRange ? (
                          <CheckCircle className="w-7 h-7 text-white" />
                        ) : (
                          <AlertTriangle className="w-7 h-7 text-white" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className={`font-bold text-lg mb-2 ${
                          isInOfficeRange 
                            ? 'text-green-300' 
                            : 'text-red-300'
                        }`}>
                          {isInOfficeRange ? '✅ At Blackhole Office' : '❌ Outside Office Range'}
                        </h4>
                        <p className={`text-sm leading-relaxed ${
                          isInOfficeRange 
                            ? 'text-green-200' 
                            : 'text-red-200'
                        }`}>
                          {isInOfficeRange ? 
                            '🏢 You are at Blackhole Infiverse LLP office location and can start your day.' :
                            `📍 You are ${distanceFromOffice >= 1000 ? `${(distanceFromOffice / 1000).toFixed(1)}km` : `${distanceFromOffice}m`} away from office (allowed: ${OFFICE_RADIUS}m). You cannot start day as Office from this location.`
                          }
                        </p>
                        
                        {!isInOfficeRange && (
                          <div className="mt-4 p-4 bg-yellow-600/20 backdrop-blur-sm border border-yellow-500/30 rounded-xl shadow-md">
                            <p className="text-sm text-yellow-300 font-bold mb-2 flex items-center gap-2">
                              <Building className="w-5 h-5" />
                              Office Location:
                            </p>
                            <p className="text-xs text-yellow-200 leading-relaxed">
                              {OFFICE_ADDRESS}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative overflow-hidden rounded-xl p-4 shadow-lg backdrop-blur-sm border border-blue-500/30 bg-blue-600/20">
                    <div className="flex items-start space-x-3">
                      <div className="p-2.5 rounded-xl bg-blue-500 shadow-md">
                        <Home className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-base text-blue-300 mb-1">
                          🏠 Work From Home Active
                        </h4>
                        <p className="text-xs text-blue-200 leading-relaxed">
                          {!isInOfficeRange 
                            ? `📍 You are ${distanceFromOffice >= 1000 ? `${(distanceFromOffice / 1000).toFixed(1)}km` : `${distanceFromOffice}m`} away from office premises. You can start your day remotely from home.`
                            : '📍 You are within office range, but opted to start work from home today.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Work Options */}
                <div className="space-y-3">
                  <h4 className="font-bold text-base text-white flex items-center gap-2">
                    <MapPinned className="w-5 h-5 text-blue-400" />
                    Choose Work Location:
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant={!workFromHome ? "default" : "outline"}
                      onClick={() => {
                        if (isInOfficeRange) setWorkFromHome(false);
                      }}
                      disabled={!isInOfficeRange}
                      className={`relative h-20 flex-col space-y-2 transition-all duration-200 ${
                        !isInOfficeRange 
                          ? 'border border-gray-600/40 bg-gray-700/30 text-gray-400 cursor-not-allowed opacity-40'
                          : !workFromHome 
                            ? 'bg-blue-500/90 hover:bg-blue-600/90 text-white shadow-lg border border-blue-400/50' 
                            : 'border border-gray-500/30 bg-gray-600/50 hover:bg-gray-600/60 text-white backdrop-blur-sm'
                      }`}
                    >
                      <Building className="w-7 h-7" />
                      <span className="font-semibold text-sm">Office</span>
                      {!isInOfficeRange && (
                        <span className="text-[10px] font-bold bg-red-500/40 text-red-200 px-2 py-0.5 rounded-full">
                          Too far ({distanceFromOffice ? `${Math.round(distanceFromOffice / 1000)}km` : 'outside range'})
                        </span>
                      )}
                      {!workFromHome && isInOfficeRange && (
                        <div className="absolute top-2 right-2 w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse shadow-lg"></div>
                      )}
                    </Button>
                    
                    <Button
                      variant={workFromHome ? "default" : "outline"}
                      onClick={() => setWorkFromHome(true)}
                      className={`relative h-20 flex-col space-y-2 transition-all duration-200 ${
                        workFromHome 
                          ? 'bg-green-500/90 hover:bg-green-600/90 text-white shadow-lg border border-green-400/50' 
                          : 'border border-gray-500/30 bg-gray-600/50 hover:bg-gray-600/60 text-white backdrop-blur-sm'
                      }`}
                    >
                      <Home className="w-7 h-7" />
                      <span className="font-semibold text-sm">Work From Home</span>
                      {workFromHome && (
                        <div className="absolute top-2 right-2 w-2.5 h-2.5 bg-blue-400 rounded-full animate-pulse shadow-lg"></div>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setStep('location')}
                    className="flex-1 h-11 border border-gray-500/30 bg-gray-600/50 hover:bg-gray-600/60 text-white backdrop-blur-sm font-semibold transition-all duration-200"
                  >
                    Back
                  </Button>
                  
                  <Button
                    onClick={handleStartDay}
                    disabled={loading || (!isInOfficeRange && !workFromHome)}
                    className="flex-1 h-11 bg-green-500/90 hover:bg-green-600/90 text-white shadow-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed border border-green-400/50"
                  >
                    {loading ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Starting...</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="w-5 h-5" />
                        <span>Start Day</span>
                      </div>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EnhancedStartDayDialog;