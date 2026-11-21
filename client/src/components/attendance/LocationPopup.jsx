import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin,
  Home,
  Building,
  CheckCircle,
  AlertTriangle,
  Navigation,
  Clock,
  Star
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { toast } from 'react-hot-toast';
import { formatDate } from '../../lib/dateFormat';

const OFFICE_COORDINATES = {
  latitude: 19.165492,
  longitude: 72.835340
};
const OFFICE_RADIUS = 2000; // meters
const OFFICE_ADDRESS = 'Blackhole Infiverse LLP, Road Number 3, near Hathi Circle, above Bright Connection, Kala Galli, Motilal Nagar II, Goregaon West, Mumbai, Maharashtra';

const LocationPopup = ({ isOpen, onClose, onLocationConfirmed, loading }) => {
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [workFromHome, setWorkFromHome] = useState(false);
  const [isInOfficeRange, setIsInOfficeRange] = useState(false);
  const [distanceFromOffice, setDistanceFromOffice] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getCurrentLocation();
    }
  }, [isOpen]);

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

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser');
      return;
    }

    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        };
        
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
        if (!inRange) {
          setWorkFromHome(true);
        } else {
          setWorkFromHome(false);
        }
        setLocationLoading(false);
      },
      (error) => {
        console.error('Location error:', error);
        let errorMessage = 'Unable to get your location. ';
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage += 'Please enable location permission and try again.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage += 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            errorMessage += 'Location request timed out. Please try again.';
            break;
          default:
            errorMessage += error.message;
            break;
        }
        
        setLocationError(errorMessage);
        setLocationLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000
      }
    );
  };

  const handleConfirmLocation = () => {
    if (!location) {
      toast.error('Please wait for location to be detected');
      return;
    }

    if (!workFromHome && !isInOfficeRange) {
      toast.error('You must be at office or select Work From Home option');
      return;
    }

    onLocationConfirmed({
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      workFromHome,
      workLocation: workFromHome ? 'Home' : 'Office',
      address: workFromHome ? 'Work From Home' : 'Blackhole Infiverse LLP Office',
      distanceFromOffice
    });
  };

  const getLocationStatusColor = () => {
    if (!location) return 'bg-gray-500';
    if (workFromHome) return 'bg-blue-500';
    if (isInOfficeRange) return 'bg-green-500';
    return 'bg-red-500';
  };

  const getLocationStatusText = () => {
    if (!location) return 'Detecting location...';
    if (workFromHome) return 'Work From Home Selected';
    if (isInOfficeRange) return 'At Blackhole Office ✓';
    return 'Outside office range ⚠️';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto p-6 rounded-2xl border-2 border-border bg-card text-card-foreground shadow-2xl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 text-xl">
            <MapPin className="w-6 h-6 text-blue-600" />
            <span>Location Verification</span>
          </DialogTitle>
          <DialogDescription>
            Please verify your work location to start your day
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Time */}
          <div className="text-center p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
            <div className="flex items-center justify-center gap-2 text-lg font-semibold text-gray-900">
              <Clock className="w-5 h-5 text-blue-600" />
              {new Date().toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })}
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {formatDate(new Date())}
            </p>
          </div>

          {/* Location Status */}
          <div className="text-center">
            <div className={`w-16 h-16 ${getLocationStatusColor()} rounded-full flex items-center justify-center mx-auto mb-4`}>
              {locationLoading ? (
                <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : workFromHome ? (
                <Home className="w-8 h-8 text-white" />
              ) : isInOfficeRange ? (
                <CheckCircle className="w-8 h-8 text-white" />
              ) : (
                <AlertTriangle className="w-8 h-8 text-white" />
              )}
            </div>
            
            <h3 className="text-lg font-semibold mb-2">{getLocationStatusText()}</h3>
            
            {location && (
              <div className="text-sm text-gray-600 space-y-1">
                <p>Coordinates: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</p>
                <p>Accuracy: ±{Math.round(location.accuracy)}m</p>
                {distanceFromOffice !== null && (
                  <p>Distance from office: {distanceFromOffice}m</p>
                )}
              </div>
            )}
          </div>

          {/* Location Error */}
          {locationError && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-4">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-red-900">Location Error</h4>
                    <p className="text-sm text-red-700 mt-1">{locationError}</p>
                    <Button
                      onClick={getCurrentLocation}
                      variant="outline"
                      size="sm"
                      className="mt-2 border-red-300 text-red-700 hover:bg-red-50"
                    >
                      <Navigation className="w-4 h-4 mr-2" />
                      Retry Location
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Office Range Validation */}
          {location && !workFromHome && (
            <Card className={isInOfficeRange ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
              <CardContent className="p-4">
                <div className="flex items-start space-x-3">
                  {isInOfficeRange ? (
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <h4 className={`font-medium ${isInOfficeRange ? 'text-green-900' : 'text-red-900'}`}>
                      {isInOfficeRange ? '✅ At Blackhole Office' : '❌ Outside Office Range'}
                    </h4>
                    <p className={`text-sm mt-1 ${isInOfficeRange ? 'text-green-700' : 'text-red-700'}`}>
                      {isInOfficeRange ? 
                        '🏢 You are at Blackhole Infiverse LLP office location and can start your day.' :
                        `📍 You are ${distanceFromOffice}m away from office (allowed: 100m). Please reach office or work from home.`
                      }
                    </p>
                    
                    {!isInOfficeRange && (
                      <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800 font-medium">
                          🏢 Office Location:
                        </p>
                        <p className="text-xs text-yellow-700 mt-1">
                          {OFFICE_ADDRESS}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Work Location Options */}
          {location && (
            <div className="space-y-3">
              <h4 className="font-medium text-gray-900">Choose Work Location:</h4>
              
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant={!workFromHome ? "default" : "outline"}
                  onClick={() => {
                    if (isInOfficeRange) setWorkFromHome(false);
                  }}
                  disabled={!isInOfficeRange}
                  className="h-20 flex-col space-y-2"
                >
                  <Building className="w-6 h-6" />
                  <span>Office</span>
                  {!isInOfficeRange && (
                    <span className="text-xs text-red-600">Too far ({distanceFromOffice ? `${Math.round(distanceFromOffice / 1000)}km` : ''})</span>
                  )}
                </Button>
                
                <Button
                  variant={workFromHome ? "default" : "outline"}
                  onClick={() => setWorkFromHome(true)}
                  className="h-20 flex-col space-y-2"
                >
                  <Home className="w-6 h-6" />
                  <span>Work From Home</span>
                  {workFromHome && <span className="text-xs text-green-600">🏠 WFH</span>}
                </Button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={loading}
            >
              Cancel
            </Button>
            
            <Button
              onClick={handleConfirmLocation}
              disabled={loading || !location || (!isInOfficeRange && !workFromHome)}
              className="flex-1 h-12"
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Starting Day...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5" />
                  <span>Start Day</span>
                </div>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LocationPopup;
