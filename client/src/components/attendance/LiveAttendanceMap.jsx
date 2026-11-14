import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  MapPin, 
  Users, 
  Navigation, 
  Wifi, 
  WifiOff,
  Clock,
  Building,
  Smartphone,
  Monitor,
  AlertTriangle,
  CheckCircle,
  XCircle,
  AlertCircle,
  Search,
  X
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Input } from '../ui/input';
import { formatDate } from '../../lib/dateFormat';
// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom office marker icon
const officeIcon = L.divIcon({
  className: 'custom-office-marker',
  html: `<div style="
    width: 32px;
    height: 32px;
    background-color: #ef4444;
    border: 3px solid white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  ">
    <svg width="16" height="16" fill="white" viewBox="0 0 24 24">
      <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
    </svg>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// Custom employee marker icon
const createEmployeeIcon = (status, isWithinRadius, isWFH = false) => {
  let color = status === 'Present' ? '#22c55e' : status === 'Late' ? '#eab308' : '#ef4444';
  // WFH employees get a purple/blue color to distinguish them
  if (isWFH) {
    color = '#8b5cf6'; // Purple color for WFH
  }
  
  return L.divIcon({
    className: 'custom-employee-marker',
    html: `<div style="
      width: 28px;
      height: 28px;
      background-color: ${color};
      border: 2px solid white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      position: relative;
    ">
      ${isWFH ? '<div style="position: absolute; top: -2px; right: -2px; width: 10px; height: 10px; background-color: #8b5cf6; border: 2px solid white; border-radius: 50%;"></div>' : ''}
      ${!isWFH && isWithinRadius ? '<div style="position: absolute; top: -2px; right: -2px; width: 10px; height: 10px; background-color: #22c55e; border: 2px solid white; border-radius: 50%;"></div>' : ''}
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

// Component to center map on office location
function MapCenter({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);
  return null;
}

// Component to handle map centering from parent
function MapController({ onMapReady, targetLocation }) {
  const map = useMap();
  
  useEffect(() => {
    if (onMapReady) {
      onMapReady(map);
    }
  }, [map, onMapReady]);
  
  useEffect(() => {
    if (targetLocation && map) {
      map.setView([targetLocation.lat, targetLocation.lng], 15, {
        animate: true,
        duration: 0.5
      });
    }
  }, [map, targetLocation]);
  
  return null;
}

// Function to get detailed address from coordinates (reverse geocoding)
// Uses backend API to avoid CORS issues in production
const getDetailedAddress = async (lat, lng) => {
  try {
    const token = localStorage.getItem("WorkflowToken");
    const API_URL = import.meta.env.VITE_API_URL || 
      (typeof window !== 'undefined' && window.location.origin.includes('vercel.app')
        ? 'https://blackholeworkflow.onrender.com/api'
        : typeof window !== 'undefined' 
          ? `${window.location.origin}/api`
          : 'http://localhost:5000/api');

    const response = await fetch(
      `${API_URL}/attendance/reverse-geocode?latitude=${lat}&longitude=${lng}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'x-auth-token': token })
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.data) {
      // Build formatted address from components (prioritize components over fullAddress)
      const addressParts = [];
      if (result.data.houseNumber && result.data.houseNumber !== 'N/A' && result.data.road && result.data.road !== 'N/A') {
        addressParts.push(`${result.data.houseNumber} ${result.data.road}`);
      } else if (result.data.road && result.data.road !== 'N/A') {
        addressParts.push(result.data.road);
      }
      if (result.data.area && result.data.area !== 'N/A') addressParts.push(result.data.area);
      if (result.data.city && result.data.city !== 'N/A') addressParts.push(result.data.city);
      if (result.data.state && result.data.state !== 'N/A') addressParts.push(result.data.state);
      if (result.data.pincode && result.data.pincode !== 'N/A') addressParts.push(result.data.pincode);
      if (result.data.country && result.data.country !== 'N/A') addressParts.push(result.data.country);
      
      // Check if fullAddress is coordinates
      const isCoordinates = result.data.fullAddress && /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(result.data.fullAddress.trim());
      
      const formattedAddress = addressParts.length > 0 
        ? addressParts.join(', ')
        : (result.data.fullAddress && !isCoordinates)
          ? result.data.fullAddress
          : null;
      
      return {
        fullAddress: formattedAddress || (result.data.fullAddress && !isCoordinates ? result.data.fullAddress : null),
        pincode: result.data.pincode || 'N/A',
        area: result.data.area || 'N/A',
        city: result.data.city || 'N/A',
        state: result.data.state || 'N/A',
        country: result.data.country || 'N/A',
        road: result.data.road || 'N/A',
        houseNumber: result.data.houseNumber || 'N/A',
        formattedAddress: formattedAddress || (result.data.formattedAddress && !isCoordinates ? result.data.formattedAddress : null)
      };
    } else {
      throw new Error(result.error || 'Failed to get address');
    }
  } catch (error) {
    console.warn('Reverse geocoding failed:', error);
    // Fallback: return coordinates as address
    return {
      fullAddress: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      pincode: 'N/A',
      area: 'N/A',
      city: 'N/A',
      state: 'N/A',
      country: 'N/A',
      road: 'N/A',
      houseNumber: 'N/A',
      formattedAddress: `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    };
  }
};

const LiveAttendanceMap = ({ attendance }) => {
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [locationDiscrepancies, setLocationDiscrepancies] = useState([]);
  const [showDiscrepancies, setShowDiscrepancies] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedEmployee, setHighlightedEmployee] = useState(null);
  const [targetLocation, setTargetLocation] = useState(null);
  const [addressDetails, setAddressDetails] = useState({});
  const [loadingAddress, setLoadingAddress] = useState({});
  const mapInstanceRef = useRef(null);

  // Office location
  const officeLocation = {
    lat: 19.1663,
    lng: 72.8526,
    address: "Blackhole Infiverse, Kali Gali, 176/1410, Rd Number 3, near Hathi Circle, above Bright Connection, Motilal Nagar II, Goregaon West, Mumbai, Maharashtra 400104"
  };

  const OFFICE_RADIUS = 2000; // 2km radius

  // Filter employees with location data
  const employeesWithLocation = attendance?.filter(emp => 
    emp.location && emp.location.latitude && emp.location.longitude
  ) || [];

  // Filter employees based on search query
  const filteredEmployees = employeesWithLocation.filter(emp => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const employeeName = (emp.name || emp.user?.name || '').toLowerCase();
    return (
      employeeName.includes(query) ||
      emp.email?.toLowerCase().includes(query) ||
      emp.employeeId?.toLowerCase().includes(query) ||
      emp.location?.address?.toLowerCase().includes(query)
    );
  });

  // Fetch location discrepancies
  useEffect(() => {
    const fetchDiscrepancies = async () => {
      try {
        const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
        const API_URL = import.meta.env.VITE_API_URL || 
          (typeof window !== 'undefined' && window.location.origin.includes('vercel.app')
            ? 'https://blackholeworkflow.onrender.com/api'
            : typeof window !== 'undefined' 
              ? `${window.location.origin}/api`
              : 'http://localhost:5000/api');
        
        const response = await fetch(`${API_URL}/attendance/location-discrepancies?status=pending&limit=20`, {
          headers: {
            'x-auth-token': token,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setLocationDiscrepancies(data.discrepancies || []);
        }
      } catch (error) {
        console.error('Error fetching location discrepancies:', error);
      }
    };

    // Only fetch if user is admin (you can add role check here)
    fetchDiscrepancies();
  }, []);

  // Fetch detailed addresses for all employees with locations
  useEffect(() => {
    const fetchAddresses = async () => {
      const employeesToFetch = employeesWithLocation.filter(emp => 
        emp.location?.latitude && 
        emp.location?.longitude && 
        !addressDetails[`${emp.location.latitude}_${emp.location.longitude}`] &&
        !loadingAddress[`${emp.location.latitude}_${emp.location.longitude}`]
      );
      
      // Process all employees with rate limiting (not just first 10)
      for (let i = 0; i < employeesToFetch.length; i++) {
        const employee = employeesToFetch[i];
        const key = `${employee.location.latitude}_${employee.location.longitude}`;
        
        // Skip if already loading or loaded
        if (loadingAddress[key] || addressDetails[key]) {
          continue;
        }
        
        setLoadingAddress(prev => ({ ...prev, [key]: true }));
        
        try {
          const details = await getDetailedAddress(
            employee.location.latitude,
            employee.location.longitude
          );
          setAddressDetails(prev => ({ ...prev, [key]: details }));
        } catch (error) {
          console.error('Error fetching address details:', error);
          // Store fallback address if geocoding fails
          setAddressDetails(prev => ({ 
            ...prev, 
            [key]: {
              fullAddress: employee.location?.address || `${employee.location.latitude.toFixed(6)}, ${employee.location.longitude.toFixed(6)}`,
              pincode: 'N/A',
              area: 'N/A',
              city: 'N/A',
              state: 'N/A',
              country: 'N/A',
              road: 'N/A',
              houseNumber: 'N/A',
              formattedAddress: employee.location?.address || 'Address not available'
            }
          }));
        } finally {
          setLoadingAddress(prev => ({ ...prev, [key]: false }));
        }
        
        // Add delay to respect API rate limits (1 request per second)
        if (i < employeesToFetch.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1100));
        }
      }
    };
    
    if (employeesWithLocation.length > 0) {
      fetchAddresses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeesWithLocation.length]); // Only run when employee list changes

  // Fetch address for selected employee if not already loaded
  useEffect(() => {
    if (selectedEmployee?.location?.latitude && selectedEmployee?.location?.longitude) {
      const key = `${selectedEmployee.location.latitude}_${selectedEmployee.location.longitude}`;
      
      // If address details not loaded and not currently loading, fetch them
      if (!addressDetails[key] && !loadingAddress[key]) {
        const fetchSelectedEmployeeAddress = async () => {
          console.log('📍 Fetching address for selected employee:', selectedEmployee.name, key);
          setLoadingAddress(prev => ({ ...prev, [key]: true }));
          try {
            const details = await getDetailedAddress(
              selectedEmployee.location.latitude,
              selectedEmployee.location.longitude
            );
            console.log('✅ Address details received:', details);
            setAddressDetails(prev => ({ ...prev, [key]: details }));
          } catch (error) {
            console.error('❌ Error fetching address for selected employee:', error);
            // Set fallback address
            setAddressDetails(prev => ({ 
              ...prev, 
              [key]: {
                fullAddress: selectedEmployee.location?.address || `${selectedEmployee.location.latitude.toFixed(6)}, ${selectedEmployee.location.longitude.toFixed(6)}`,
                pincode: 'N/A',
                area: 'N/A',
                city: 'N/A',
                state: 'N/A',
                country: 'N/A',
                road: 'N/A',
                houseNumber: 'N/A',
                formattedAddress: selectedEmployee.location?.address || 'Address not available'
              }
            }));
          } finally {
            setLoadingAddress(prev => ({ ...prev, [key]: false }));
          }
        };
        
        fetchSelectedEmployeeAddress();
      } else {
        console.log('📍 Address already loaded or loading for:', key, addressDetails[key] ? 'loaded' : 'loading');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployee]);

  // Calculate distance from office
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const d = R * c; // Distance in kilometers
    return d * 1000; // Convert to meters
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'present':
        return 'bg-green-500';
      case 'absent':
        return 'bg-red-500';
      case 'late':
        return 'bg-yellow-500';
      case 'on-leave':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'present':
        return <CheckCircle className="w-4 h-4" />;
      case 'absent':
        return <XCircle className="w-4 h-4" />;
      case 'late':
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const formatTime = (time) => {
    if (!time) return 'Not recorded';
    return new Date(time).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="space-y-6">
      {/* Map Header */}
      <Card className="bg-card border-border/70 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <MapPin className="w-5 h-5 text-primary" />
            Live Location Map
          </CardTitle>
          <CardDescription>
            Real-time employee locations and office proximity
          </CardDescription>
            </div>
            {locationDiscrepancies.length > 0 && (
              <Button
                variant={showDiscrepancies ? "default" : "outline"}
                onClick={() => setShowDiscrepancies(!showDiscrepancies)}
                className="flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4" />
                Location Alerts ({locationDiscrepancies.length})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-primary" />
              <span>Office Location: Mumbai, Maharashtra</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <span className="tabular-nums">{employeesWithLocation.length} employees with location data</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Location Discrepancy Alerts */}
      {showDiscrepancies && locationDiscrepancies.length > 0 && (
        <Card className="border-amber-500/40 bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-500 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              Location Discrepancy Alerts
            </CardTitle>
            <CardDescription>
              Employees with significant distance between start and end day locations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar pr-1">
              {locationDiscrepancies.map((disc) => (
                <div
                  key={disc._id}
                  className="p-3 border rounded-lg bg-amber-500/10 border-amber-500/25"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-medium text-foreground">{disc.user?.name}</span>
                        <Badge variant="outline" className={`text-xs ${
                          disc.severity === 'critical' ? 'bg-red-500/15 text-red-500 dark:text-red-400 border-red-500/30' :
                          disc.severity === 'high' ? 'bg-orange-500/15 text-orange-500 dark:text-orange-400 border-orange-500/30' :
                          'bg-amber-500/15 text-amber-500 dark:text-amber-400 border-amber-500/30'
                        }`}>
                          {disc.severity}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <p>Distance: <span className="font-semibold text-foreground tabular-nums">{disc.distanceKm.toFixed(2)} km</span></p>
                        <p className="text-xs mt-1 break-words">
                          Start: {disc.startLocation?.address || 'Unknown'} → 
                          End: {disc.endLocation?.address || 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground/80 mt-1">
                          {formatDate(disc.date)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Map Visualization */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Interactive Map */}
        <div className="lg:col-span-2">
          <Card className="h-[600px]">
            <CardContent className="p-0 h-full">
              {typeof window !== 'undefined' && (
                <MapContainer
                  center={[officeLocation.lat, officeLocation.lng]}
                  zoom={13}
                  style={{ height: '100%', width: '100%', zIndex: 0 }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  
                  {/* Map Controller for centering */}
                  <MapController 
                    onMapReady={(map) => { mapInstanceRef.current = map; }}
                    targetLocation={targetLocation} 
                  />
                  
                  {/* Office Location Marker */}
                  <Marker
                    position={[officeLocation.lat, officeLocation.lng]}
                    icon={officeIcon}
                  >
                    <Popup>
                      <div className="text-center">
                        <Building className="w-5 h-5 mx-auto mb-1 text-red-500" />
                        <strong>Office Location</strong>
                        <p className="text-xs mt-1">{officeLocation.address}</p>
                    </div>
                    </Popup>
                  </Marker>

                  {/* Office Radius Circle */}
                  <Circle
                    center={[officeLocation.lat, officeLocation.lng]}
                    radius={OFFICE_RADIUS}
                    pathOptions={{
                      color: '#3b82f6',
                      fillColor: '#3b82f6',
                      fillOpacity: 0.1,
                      weight: 2
                    }}
                  />

                {/* Employee Markers */}
                  {filteredEmployees.map((employee) => {
                  const distance = calculateDistance(
                    officeLocation.lat,
                    officeLocation.lng,
                    employee.location.latitude,
                    employee.location.longitude
                  );
                    const isWithinRadius = distance <= OFFICE_RADIUS;
                    const isWFH = employee.workLocationType === 'Home' || 
                                  employee.workPattern === 'Remote' || 
                                  employee.location?.address?.toLowerCase().includes('work from home') ||
                                  employee.location?.address?.toLowerCase().includes('wfh');
                  
                  return (
                      <Marker
                        key={employee.userId || employee._id}
                        position={[employee.location.latitude, employee.location.longitude]}
                        icon={createEmployeeIcon(employee.status, isWithinRadius, isWFH)}
                        eventHandlers={{
                          click: () => {
                            setSelectedEmployee(employee);
                            setHighlightedEmployee(employee);
                            // Center map on employee location
                            setTargetLocation({
                              lat: employee.location.latitude,
                              lng: employee.location.longitude
                            });
                          }
                        }}
                      >
                        <Popup>
                          <div className="min-w-[250px]">
                            <div className="flex items-center gap-3 mb-3">
                              <Avatar className="w-12 h-12 border-2 border-gray-200">
                                <AvatarImage src={employee.avatar} />
                                <AvatarFallback className="text-sm font-semibold">
                                  {employee.name?.split(' ').map(n => n[0]).join('')}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1">
                                <p className="font-semibold text-sm text-gray-900">
                                  {employee.name || employee.user?.name || 'Unknown Employee'}
                                </p>
                                {employee.employeeId && (
                                  <p className="text-xs text-gray-500 font-mono">{employee.employeeId}</p>
                                )}
                                <Badge className={`mt-1 text-xs ${getStatusColor(employee.status)}`}>
                                  {getStatusIcon(employee.status)}
                                  <span className="ml-1">{employee.status}</span>
                                </Badge>
                        </div>
                            </div>
                            
                            <div className="space-y-2 text-xs">
                              {/* Location */}
                              {employee.location?.latitude && employee.location?.longitude && (() => {
                                const key = `${employee.location.latitude}_${employee.location.longitude}`;
                                const details = addressDetails[key];
                                const isWFH = employee.workLocationType === 'Home' || 
                                              employee.workPattern === 'Remote' || 
                                              employee.location?.address?.toLowerCase().includes('work from home') ||
                                              employee.location?.address?.toLowerCase().includes('wfh');
                                
                                return (
                                  <div className={`rounded-md p-2 ${isWFH ? 'bg-purple-50 border border-purple-200' : 'bg-gray-50'}`}>
                                    <div className="flex items-start gap-2">
                                      <MapPin className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isWFH ? 'text-purple-600' : 'text-gray-500'}`} />
                                      <div className="flex-1">
                                        {isWFH && (
                                          <div className="mb-2">
                                            <Badge className="bg-purple-100 text-purple-700 text-xs mb-1">
                                              🏠 Work From Home
                                            </Badge>
                                          </div>
                                        )}
                                        {details ? (
                                          <>
                                            {details.road !== 'N/A' && details.houseNumber !== 'N/A' && (
                                              <p className="text-gray-800 font-semibold mb-1">
                                                {details.houseNumber} {details.road}
                                              </p>
                                            )}
                                            {details.area !== 'N/A' && (
                                              <p className="text-gray-700 font-semibold mb-1">
                                                {details.area}
                                                {details.pincode !== 'N/A' && ` - ${details.pincode}`}
                                              </p>
                                            )}
                                            {details.city !== 'N/A' && details.city !== details.area && (
                                              <p className="text-gray-600 text-xs mb-1">{details.city}, {details.state !== 'N/A' ? details.state : ''}</p>
                                            )}
                                            {details.pincode !== 'N/A' && (
                                              <p className="text-gray-600 text-xs mb-2">
                                                Pincode: <span className="font-semibold">{details.pincode}</span>
                                              </p>
                                            )}
                                          </>
                                        ) : (
                                          <p className="text-gray-700 font-medium mb-1 break-words">
                                            {employee.location?.address || 'Location not available'}
                                          </p>
                                        )}
                                        {!isWFH && (
                                          <div className="flex items-center gap-2">
                                            <Navigation className={`w-3 h-3 ${isWithinRadius ? 'text-green-600' : 'text-orange-600'}`} />
                                            <span className={`font-semibold ${isWithinRadius ? 'text-green-600' : 'text-orange-600'}`}>
                                              {distance <= 1000 
                                                ? `${distance.toFixed(0)}m` 
                                                : `${(distance / 1000).toFixed(2)}km`} from office
                                              {isWithinRadius && <span className="ml-1">✓</span>}
                                            </span>
                      </div>
                                        )}
                                        {isWFH && (
                                          <div className="flex items-center gap-2 mt-2">
                                            <Navigation className="w-3 h-3 text-purple-600" />
                                            <span className="font-semibold text-purple-600">
                                              {distance <= 1000 
                                                ? `${distance.toFixed(0)}m` 
                                                : `${(distance / 1000).toFixed(2)}km`} from office (WFH)
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                              
                              {/* Fallback for employees without coordinates */}
                              {(!employee.location?.latitude || !employee.location?.longitude) && (
                                <div className="bg-gray-50 rounded-md p-2">
                                  <div className="flex items-start gap-2">
                                    <MapPin className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1">
                                      <p className="text-gray-700 font-medium mb-1">
                                        {employee.location?.address || 'Location not available'}
                                      </p>
                    </div>
                    </div>
                    </div>
                              )}
                              
                              {/* Time Info */}
                              <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-2">
                                  {employee.source === 'StartDay' ? (
                                    <Smartphone className="w-3 h-3 text-blue-500" />
                                  ) : employee.source === 'Biometric' ? (
                                    <Monitor className="w-3 h-3 text-green-500" />
                                  ) : (
                                    <Building className="w-3 h-3 text-gray-500" />
                                  )}
                                  <span className="text-gray-600">Check In:</span>
                    </div>
                                <span className="font-medium">{formatTime(employee.startTime)}</span>
                  </div>
                              
                              {employee.hoursWorked > 0 && (
                                <div className="flex items-center justify-between pt-2 border-t">
                                  <span className="text-gray-600">Hours Worked:</span>
                                  <span className="font-semibold text-gray-900">{employee.hoursWorked.toFixed(1)}h</span>
                </div>
                              )}
              </div>
                            
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full mt-3 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEmployee(employee);
                                setHighlightedEmployee(employee);
                                // Center map on employee location
                                if (employee.location) {
                                  setTargetLocation({
                                    lat: employee.location.latitude,
                                    lng: employee.location.longitude
                                  });
                                }
                                // Close the popup
                                if (mapInstanceRef.current) {
                                  mapInstanceRef.current.closePopup();
                                }
                              }}
                            >
                              View Full Details
                            </Button>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })}
                </MapContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Employee List */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Employee Locations</span>
                <Badge variant="outline" className="text-xs">
                  {filteredEmployees.length} / {employeesWithLocation.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Search Bar */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search by name, email, ID, or location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-10 bg-background/70 border-border/70"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                    onClick={() => setSearchQuery('')}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto custom-scrollbar space-y-3 pr-1">
                {filteredEmployees.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>{searchQuery ? 'No employees found' : 'No location data available'}</p>
                    {searchQuery && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={() => setSearchQuery('')}
                      >
                        Clear search
                      </Button>
                    )}
                </div>
              ) : (
                  filteredEmployees.map((employee) => {
                  const distance = calculateDistance(
                    officeLocation.lat,
                    officeLocation.lng,
                    employee.location.latitude,
                    employee.location.longitude
                  );
                    const isWithinRadius = distance <= OFFICE_RADIUS;
                    const isSelected = selectedEmployee?.userId === employee.userId || selectedEmployee?._id === employee._id;
                    const isHighlighted = highlightedEmployee?.userId === employee.userId || highlightedEmployee?._id === employee._id;
                  
                  return (
                    <motion.div
                        key={employee.userId || employee._id}
                      whileHover={{ scale: 1.01 }}
                        className={`p-4 border rounded-xl cursor-pointer transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-500/10 shadow-md ring-1 ring-blue-500/30'
                            : isHighlighted
                            ? 'border-emerald-500 bg-emerald-500/10 shadow-sm'
                            : 'border-border/70 bg-muted/20 hover:border-border hover:bg-muted/40 hover:shadow-sm'
                      }`}
                        onClick={() => {
                          setSelectedEmployee(employee);
                          setHighlightedEmployee(employee);
                          // Center map on employee location
                          if (employee.location) {
                            setTargetLocation({
                              lat: employee.location.latitude,
                              lng: employee.location.longitude
                            });
                          }
                        }}
                    >
                        <div className="flex items-start gap-3">
                            <Avatar className="w-10 h-10 border-2 border-border shadow-sm flex-shrink-0">
                            <AvatarImage src={employee.avatar} />
                            <AvatarFallback className="text-xs font-semibold">
                              {(employee.name || employee.user?.name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <p className="font-semibold text-sm text-foreground break-words">
                                {employee.name || employee.user?.name || 'Unknown Employee'}
                            </p>
                            <Badge 
                              variant="outline" 
                                className={`text-xs flex-shrink-0 ${getStatusColor(employee.status).replace('bg-', 'text-').replace('-500', '-600')}`}
                            >
                              {getStatusIcon(employee.status)}
                              <span className="ml-1">{employee.status}</span>
                            </Badge>
                              {(employee.workLocationType === 'Home' || 
                                employee.workPattern === 'Remote' || 
                                employee.location?.address?.toLowerCase().includes('work from home') ||
                                employee.location?.address?.toLowerCase().includes('wfh')) && (
                                <Badge variant="outline" className="bg-purple-500/15 text-purple-500 dark:text-purple-400 border-purple-500/30 text-xs flex-shrink-0">
                                  🏠 WFH
                                </Badge>
                              )}
                          </div>
                          
                            {employee.employeeId && (
                              <div className="flex items-center gap-1 mb-2">
                                <span className="text-xs text-muted-foreground">ID:</span>
                                <span className="text-xs font-mono text-foreground/80">{employee.employeeId}</span>
                              </div>
                            )}
                            
                            {/* Location and Distance */}
                            {employee.location?.latitude && employee.location?.longitude && (() => {
                              const key = `${employee.location.latitude}_${employee.location.longitude}`;
                              const details = addressDetails[key];
                              const isWFH = employee.workLocationType === 'Home' || 
                                            employee.workPattern === 'Remote' || 
                                            employee.location?.address?.toLowerCase().includes('work from home') ||
                                            employee.location?.address?.toLowerCase().includes('wfh');
                              
                              return (
                                <div className={`rounded-lg p-2.5 mb-2 border ${isWFH ? 'bg-purple-500/10 border-purple-500/25' : 'bg-muted/40 border-border/60'}`}>
                                  <div className="flex items-start gap-2">
                                    <MapPin className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isWFH ? 'text-purple-500 dark:text-purple-400' : 'text-muted-foreground'}`} />
                                    <div className="flex-1 min-w-0">
                                      {isWFH && (
                                        <div className="mb-2">
                                          <Badge variant="outline" className="bg-purple-500/15 text-purple-500 dark:text-purple-400 border-purple-500/30 text-xs">
                                            🏠 Work From Home
                                          </Badge>
                                        </div>
                                      )}
                                      {details ? (
                                        <>
                                          {details.road !== 'N/A' && details.houseNumber !== 'N/A' && (
                                            <p className="text-xs text-foreground font-semibold mb-1">
                                              {details.houseNumber} {details.road}
                                            </p>
                                          )}
                                          {details.area !== 'N/A' && (
                                            <p className="text-xs text-foreground/90 font-semibold mb-1">
                                              {details.area}
                                              {details.pincode !== 'N/A' && ` - ${details.pincode}`}
                                            </p>
                                          )}
                                          {details.city !== 'N/A' && details.city !== details.area && (
                                            <p className="text-xs text-muted-foreground mb-1">{details.city}, {details.state !== 'N/A' ? details.state : ''}</p>
                                          )}
                                          {details.pincode !== 'N/A' && !details.area.includes(details.pincode) && (
                                            <p className="text-xs text-muted-foreground mb-2">
                                              Pincode: <span className="font-semibold text-foreground">{details.pincode}</span>
                                            </p>
                                          )}
                                        </>
                                      ) : (
                                        <div className="space-y-1">
                                          {employee.location?.address && employee.location.address !== `${employee.location.latitude?.toFixed(6)}, ${employee.location.longitude?.toFixed(6)}` ? (
                                            <p className="text-xs text-foreground font-medium mb-2 break-words">
                                              {employee.location.address}
                                            </p>
                                          ) : (
                                            <p className="text-xs text-muted-foreground italic mb-2">
                                              Loading address details...
                                            </p>
                                          )}
                                        </div>
                                      )}
                                      <div className="flex items-center gap-2">
                                        <Navigation className={`w-3 h-3 ${isWFH ? 'text-purple-500 dark:text-purple-400' : (isWithinRadius ? 'text-emerald-500 dark:text-emerald-400' : 'text-orange-500 dark:text-orange-400')}`} />
                                        <span className={`text-xs font-semibold tabular-nums ${isWFH ? 'text-purple-500 dark:text-purple-400' : (isWithinRadius ? 'text-emerald-500 dark:text-emerald-400' : 'text-orange-500 dark:text-orange-400')}`}>
                                          {distance <= 1000 
                                            ? `${distance.toFixed(0)}m` 
                                            : `${(distance / 1000).toFixed(2)}km`} from office
                                          {isWFH && ' (WFH)'}
                                          {!isWFH && isWithinRadius && (
                                            <span className="ml-1 text-emerald-500 dark:text-emerald-400">✓</span>
                              )}
                            </span>
                          </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                            
                            {/* Fallback for employees without coordinates */}
                            {(!employee.location?.latitude || !employee.location?.longitude) && (
                              <div className="bg-muted/40 border border-border/60 rounded-lg p-2.5 mb-2">
                                <div className="flex items-start gap-2">
                                  <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs text-muted-foreground mb-1 font-medium">Address:</p>
                                    <p className="text-xs text-foreground font-medium mb-2 break-words">
                                      {employee.location?.address || employee.workLocationType || 'Location not available'}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {/* Check-in Time */}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                            {employee.source === 'StartDay' ? (
                              <Smartphone className="w-3 h-3 text-blue-500" />
                            ) : employee.source === 'Biometric' ? (
                              <Monitor className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Building className="w-3 h-3 text-muted-foreground" />
                            )}
                              <Clock className="w-3 h-3 text-muted-foreground" />
                              <span>Checked in: {formatTime(employee.startTime)}</span>
                          </div>
                            
                            {employee.hoursWorked > 0 && (
                              <div className="mt-2 pt-2 border-t border-border/60">
                                <div className="flex items-center justify-between text-xs tabular-nums">
                                  <span className="text-muted-foreground">Hours worked:</span>
                                  <span className="font-semibold text-foreground">{employee.hoursWorked.toFixed(1)}h</span>
                                </div>
                              </div>
                            )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
              </div>
            </CardContent>
          </Card>

          {/* Selected Employee Details */}
          {selectedEmployee && (
            <Card className="bg-card border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg text-foreground">Employee Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar className="w-12 h-12 border border-border/70">
                    <AvatarImage src={selectedEmployee.avatar} />
                    <AvatarFallback>
                      {(selectedEmployee.name || selectedEmployee.user?.name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h4 className="font-medium text-foreground truncate">
                      {selectedEmployee.name || selectedEmployee.user?.name || 'Unknown Employee'}
                    </h4>
                    <p className="text-sm text-muted-foreground truncate">{selectedEmployee.email}</p>
                  </div>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Status:</span>
                    <div className="flex items-center gap-2">
                    <Badge variant="outline" className={getStatusColor(selectedEmployee.status).replace('bg-', 'text-').replace('-500', '-600')}>
                      {selectedEmployee.status}
                    </Badge>
                      {(selectedEmployee.workLocationType === 'Home' || 
                        selectedEmployee.workPattern === 'Remote' || 
                        selectedEmployee.location?.address?.toLowerCase().includes('work from home') ||
                        selectedEmployee.location?.address?.toLowerCase().includes('wfh')) && (
                        <Badge variant="outline" className="bg-purple-500/15 text-purple-500 dark:text-purple-400 border-purple-500/30 text-xs">
                          🏠 WFH
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Check In:</span>
                    <span className="text-foreground tabular-nums">{formatTime(selectedEmployee.startTime)}</span>
                  </div>
                  
                  {/* Address Section */}
                  {selectedEmployee.location?.latitude && selectedEmployee.location?.longitude && (() => {
                    const key = `${selectedEmployee.location.latitude}_${selectedEmployee.location.longitude}`;
                    const details = addressDetails[key];
                    const isLoading = loadingAddress[key];
                    
                    const isWFH = selectedEmployee.workLocationType === 'Home' || 
                                  selectedEmployee.workPattern === 'Remote' || 
                                  selectedEmployee.location?.address?.toLowerCase().includes('work from home') ||
                                  selectedEmployee.location?.address?.toLowerCase().includes('wfh');
                    
                    return (
                      <div className={`rounded-lg p-3 border ${isWFH ? 'bg-purple-500/10 border-purple-500/25' : 'bg-muted/40 border-border/70'}`}>
                        <div className="flex items-start gap-2">
                          <MapPin className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isWFH ? 'text-purple-500 dark:text-purple-400' : 'text-muted-foreground'}`} />
                          <div className="flex-1 min-w-0">
                            {isWFH && (
                              <div className="mb-2">
                                <Badge variant="outline" className="bg-purple-500/15 text-purple-500 dark:text-purple-400 border-purple-500/30 text-xs">
                                  🏠 Work From Home
                                </Badge>
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground mb-2 font-semibold">Exact Location Details:</p>
                            
                            {isLoading ? (
                              <div className="text-xs text-muted-foreground italic">Loading address details...</div>
                            ) : details ? (
                              <div className="space-y-2 text-xs">
                                {/* Build address parts first */}
                                {(() => {
                                  const addressParts = [];
                                  const hasComponents = details.road !== 'N/A' || details.houseNumber !== 'N/A' || 
                                                       details.area !== 'N/A' || details.city !== 'N/A' || 
                                                       details.state !== 'N/A' || details.pincode !== 'N/A';
                                  
                                  // Show individual components if available
                                  if (hasComponents) {
                                    return (
                                      <>
                                        {(details.road !== 'N/A' || details.houseNumber !== 'N/A') && (
                                          <div>
                                            <span className="text-muted-foreground font-medium">Street Address: </span>
                                            <span className="text-foreground">
                                              {details.houseNumber !== 'N/A' && details.road !== 'N/A' 
                                                ? `${details.houseNumber} ${details.road}`
                                                : details.road !== 'N/A' 
                                                  ? details.road
                                                  : details.houseNumber !== 'N/A'
                                                    ? details.houseNumber
                                                    : 'N/A'}
                    </span>
                  </div>
                                        )}
                                        {details.area !== 'N/A' && (
                                          <div>
                                            <span className="text-muted-foreground font-medium">Area: </span>
                                            <span className="text-foreground">{details.area}</span>
                                          </div>
                                        )}
                                        {details.city !== 'N/A' && (
                                          <div>
                                            <span className="text-muted-foreground font-medium">City: </span>
                                            <span className="text-foreground">{details.city}</span>
                                          </div>
                                        )}
                                        {details.state !== 'N/A' && (
                                          <div>
                                            <span className="text-muted-foreground font-medium">State: </span>
                                            <span className="text-foreground">{details.state}</span>
                                          </div>
                                        )}
                                        {details.pincode !== 'N/A' && (
                                          <div>
                                            <span className="text-muted-foreground font-medium">Pincode: </span>
                                            <span className="text-foreground font-semibold">{details.pincode}</span>
                                          </div>
                                        )}
                                        {details.country !== 'N/A' && (
                                          <div>
                                            <span className="text-muted-foreground font-medium">Country: </span>
                                            <span className="text-foreground">{details.country}</span>
                                          </div>
                                        )}
                                      </>
                                    );
                                  }
                                  
                                  return null;
                                })()}
                                
                                {/* Always show full formatted address */}
                                {(() => {
                                  const addressParts = [];
                                  if (details.houseNumber !== 'N/A' && details.road !== 'N/A') {
                                    addressParts.push(`${details.houseNumber} ${details.road}`);
                                  } else if (details.road !== 'N/A') {
                                    addressParts.push(details.road);
                                  }
                                  if (details.area !== 'N/A') addressParts.push(details.area);
                                  if (details.city !== 'N/A') addressParts.push(details.city);
                                  if (details.state !== 'N/A') addressParts.push(details.state);
                                  if (details.pincode !== 'N/A') addressParts.push(details.pincode);
                                  if (details.country !== 'N/A') addressParts.push(details.country);
                                  
                                  // Check if formattedAddress is coordinates
                                  const isFormattedCoordinates = details.formattedAddress && /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(details.formattedAddress.trim());
                                  const isFullAddressCoordinates = details.fullAddress && /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(details.fullAddress.trim());
                                  
                                  const formattedFullAddress = addressParts.length > 0 
                                    ? addressParts.join(', ')
                                    : (details.formattedAddress && !isFormattedCoordinates)
                                      ? details.formattedAddress
                                      : (details.fullAddress && !isFullAddressCoordinates)
                                        ? details.fullAddress
                                        : null;
                                  
                                  // Always show full address section if we have any address data
                                  if (formattedFullAddress) {
                                    return (
                                      <div className="mt-3 pt-2 border-t border-border/60">
                                        <p className="text-muted-foreground font-medium mb-1">Full Address:</p>
                                        <p className="text-foreground break-words font-semibold">{formattedFullAddress}</p>
                                      </div>
                                    );
                                  }
                                  
                                  // If no formatted address, show stored address if available
                                  const storedAddress = selectedEmployee.location?.address;
                                  const isStoredCoordinates = storedAddress && /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(storedAddress.trim());
                                  
                                  if (storedAddress && !isStoredCoordinates) {
                                    return (
                                      <div className="mt-3 pt-2 border-t border-border/60">
                                        <p className="text-muted-foreground font-medium mb-1">Full Address:</p>
                                        <p className="text-foreground break-words font-semibold">{storedAddress}</p>
                                      </div>
                                    );
                                  }
                                  
                                  return null;
                                })()}
                              </div>
                            ) : (
                              <div className="space-y-2 text-xs">
                                {(() => {
                                  // Check if stored address is coordinates
                                  const storedAddress = selectedEmployee.location?.address;
                                  const isCoordinates = storedAddress && /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(storedAddress.trim());
                                  
                                  if (isCoordinates) {
                                    return (
                                      <div>
                                        <p className="text-muted-foreground italic mb-2">
                                          Fetching detailed address...
                                        </p>
                                        <div className="mt-2 pt-2 border-t border-border/60">
                                          <p className="text-muted-foreground text-xs">Coordinates (for reference only):</p>
                                          <p className="text-foreground/80 font-mono text-xs tabular-nums">
                                            {selectedEmployee.location.latitude.toFixed(6)}, {selectedEmployee.location.longitude.toFixed(6)}
                                          </p>
                                        </div>
                                      </div>
                                    );
                                  } else if (storedAddress) {
                                    return (
                                      <div>
                                        <p className="text-foreground break-words font-medium mb-2">
                                          {storedAddress}
                                        </p>
                                        <div className="mt-2 pt-2 border-t border-border/60">
                                          <p className="text-muted-foreground text-xs">Coordinates (for reference only):</p>
                                          <p className="text-foreground/80 font-mono text-xs tabular-nums">
                                            {selectedEmployee.location.latitude.toFixed(6)}, {selectedEmployee.location.longitude.toFixed(6)}
                                          </p>
                                        </div>
                                      </div>
                                    );
                                  } else {
                                    return (
                                      <div>
                                        <p className="text-muted-foreground italic mb-2">
                                          Loading detailed address...
                                        </p>
                                        <div className="mt-2 pt-2 border-t border-border/60">
                                          <p className="text-muted-foreground text-xs">Coordinates (for reference only):</p>
                                          <p className="text-foreground/80 font-mono text-xs tabular-nums">
                                            {selectedEmployee.location.latitude.toFixed(6)}, {selectedEmployee.location.longitude.toFixed(6)}
                                          </p>
                                        </div>
                                      </div>
                                    );
                                  }
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  
                  {/* Fallback for employees without coordinates */}
                  {(!selectedEmployee.location?.latitude || !selectedEmployee.location?.longitude) && (
                    <div className="bg-muted/40 rounded-lg p-3 border border-border/70">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground mb-1 font-medium">Location:</p>
                          <p className="text-xs text-foreground break-words">
                            {selectedEmployee.location?.address || selectedEmployee.workLocationType || 'Location not available'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Always show coordinates as secondary info (not primary) */}
                  {selectedEmployee.location?.latitude && selectedEmployee.location?.longitude && (
                    <div className="mt-2 pt-2 border-t border-border/60">
                      <p className="text-xs text-muted-foreground">Coordinates (for reference):</p>
                      <p className="text-xs text-foreground/80 font-mono tabular-nums">
                        {selectedEmployee.location.latitude.toFixed(6)}, {selectedEmployee.location.longitude.toFixed(6)}
                      </p>
                    </div>
                  )}
                  
                  {selectedEmployee.location?.latitude && selectedEmployee.location?.longitude && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Distance:</span>
                      <span className="font-semibold text-foreground tabular-nums">
                      {calculateDistance(
                        officeLocation.lat,
                        officeLocation.lng,
                        selectedEmployee.location.latitude,
                        selectedEmployee.location.longitude
                        ) <= 1000 
                          ? `${calculateDistance(
                              officeLocation.lat,
                              officeLocation.lng,
                              selectedEmployee.location.latitude,
                              selectedEmployee.location.longitude
                            ).toFixed(0)}m`
                          : `${(calculateDistance(
                              officeLocation.lat,
                              officeLocation.lng,
                              selectedEmployee.location.latitude,
                              selectedEmployee.location.longitude
                            ) / 1000).toFixed(2)}km`} from office
                    </span>
                  </div>
                  )}
                  
                  {selectedEmployee.hoursWorked > 0 && (
                    <div className="flex justify-between pt-2 border-t border-border/60">
                      <span className="text-muted-foreground">Hours Worked:</span>
                      <span className="font-semibold text-foreground tabular-nums">{selectedEmployee.hoursWorked.toFixed(1)}h</span>
                    </div>
                  )}
                </div>

                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => setSelectedEmployee(null)}
                >
                  Close Details
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveAttendanceMap;

