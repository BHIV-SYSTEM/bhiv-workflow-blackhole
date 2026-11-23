const express = require('express');
const router = express.Router();
const geolib = require('geolib');
const Attendance = require('../models/Attendance');
const MonitoringAlert = require('../models/MonitoringAlert');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Office coordinates from environment
const OFFICE_COORDINATES = {
  latitude: parseFloat(process.env.OFFICE_LAT) || 19.160122,
  longitude: parseFloat(process.env.OFFICE_LNG) || 72.839720
};
const OFFICE_RADIUS = parseInt(process.env.OFFICE_RADIUS) || 2000; // meters
const GEOFENCE_CHECK_INTERVAL = parseInt(process.env.GEOFENCE_CHECK_INTERVAL) || 30000;
const LOCATION_UPDATE_THRESHOLD = 50; // minimum meters moved to update

// Helper function to validate IP address
const validateIP = (ip, whitelistedIPs = []) => {
  if (!whitelistedIPs || whitelistedIPs.length === 0) return true;
  
  // Check if IP is in whitelist
  const isWhitelisted = whitelistedIPs.some(allowedIP => {
    if (allowedIP.includes('/')) {
      // CIDR notation support
      return isIPInCIDR(ip, allowedIP);
    }
    return ip === allowedIP;
  });
  
  return isWhitelisted;
};

// Helper function to check CIDR ranges
const isIPInCIDR = (ip, cidr) => {
  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits)) - 1);
  const ipInt = ip.split('.').reduce((int, oct) => (int << 8) + parseInt(oct, 10), 0) >>> 0;
  const rangeInt = range.split('.').reduce((int, oct) => (int << 8) + parseInt(oct, 10), 0) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
};

// Helper function to calculate distance
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  return geolib.getDistance(
    { latitude: lat1, longitude: lon1 },
    { latitude: lat2, longitude: lon2 }
  );
};

// Helper function to create location alert
const createLocationAlert = async (userId, type, data, io) => {
  try {
    const alert = new MonitoringAlert({
      employee: userId,
      type: 'Location',
      severity: type === 'Exit' ? 'High' : 'Medium',
      title: getAlertTitle(type),
      description: getAlertDescription(type, data),
      metadata: {
        locationType: type,
        location: data.location,
        distance: data.distance,
        timestamp: new Date()
      },
      timestamp: new Date(),
      resolved: false
    });
    
    await alert.save();
    
    // Emit WebSocket event
    if (io) {
      io.emit('alert:triggered', {
        alert: alert.toObject(),
        userId,
        type: 'location'
      });
      
      io.emit('attendance:location-alert', {
        userId,
        alertType: type,
        distance: data.distance,
        location: data.location,
        timestamp: new Date()
      });
    }
    
    return alert;
  } catch (error) {
    console.error('❌ Error creating location alert:', error);
    throw error;
  }
};

const getAlertTitle = (type) => {
  switch (type) {
    case 'Exit': return '🚨 Geofence Exit Detected';
    case 'LongAbsence': return '⏰ Extended Time Outside Office';
    case 'UnauthorizedLocation': return '📍 Unauthorized Location Detected';
    default: return '⚠️ Location Alert';
  }
};

const getAlertDescription = (type, data) => {
  switch (type) {
    case 'Exit':
      return `Employee has left the office radius (${data.distance}m away from office)`;
    case 'LongAbsence':
      return `Employee has been outside office for ${data.duration} minutes`;
    case 'UnauthorizedLocation':
      return `Employee detected at unauthorized location (${data.distance}m from office)`;
    default:
      return 'Location monitoring alert triggered';
  }
};

/**
 * @route   POST /api/attendance/live/start/:userId
 * @desc    Start live location tracking for user
 * @access  Private
 */
router.post('/start/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      latitude, 
      longitude, 
      accuracy, 
      deviceId, 
      deviceFingerprint,
      platform,
      browser
    } = req.body;
    
    // Verify authorization
    if (req.user.id !== userId && req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Not authorized to start tracking for this user'
      });
    }
    
    // Location is optional: enabling live tracking must never fabricate a
    // position for the employee. Only geofence when a real fix is supplied.
    const hasLocation =
      Number.isFinite(parseFloat(latitude)) && Number.isFinite(parseFloat(longitude));
    let distanceFromOffice;
    let insideGeofence;

    // Get or create today's attendance record
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let attendance = await Attendance.findOne({
      user: userId,
      date: today
    });
    
    if (!attendance) {
      return res.status(400).json({
        success: false,
        error: 'AttendanceNotStarted',
        message: 'Please start your day first before enabling live tracking',
        code: 'DAY_NOT_STARTED'
      });
    }
    
    // Check if already tracking
    if (attendance.liveTracking.enabled && attendance.liveTracking.status === 'Active') {
      return res.status(400).json({
        success: false,
        error: 'TrackingActive',
        message: 'Live tracking is already active',
        code: 'TRACKING_ALREADY_ACTIVE',
        data: {
          startedAt: attendance.liveTracking.startedAt,
          lastUpdate: attendance.liveTracking.lastUpdate
        }
      });
    }
    
    // Get client IP
    const clientIP = req.headers['x-forwarded-for'] || 
                     req.connection.remoteAddress || 
                     req.socket.remoteAddress;
    
    // Update attendance record
    attendance.liveTracking = {
      enabled: true,
      startedAt: new Date(),
      lastUpdate: new Date(),
      updateInterval: GEOFENCE_CHECK_INTERVAL,
      status: 'Active'
    };
    
    if (hasLocation) {
      // Calculate distance from office
      distanceFromOffice = calculateDistance(
        latitude,
        longitude,
        OFFICE_COORDINATES.latitude,
        OFFICE_COORDINATES.longitude
      );

      insideGeofence = distanceFromOffice <= OFFICE_RADIUS;

      // Add initial location to history (only when a genuine fix was supplied)
      attendance.locationHistory.push({
        latitude,
        longitude,
        accuracy,
        timestamp: new Date(),
        insideGeofence,
        distanceFromOffice,
        deviceInfo: {
          ipAddress: clientIP,
          deviceId: deviceId || deviceFingerprint
        }
      });
    }
    
    // Update device info
    attendance.deviceInfo = {
      ...attendance.deviceInfo,
      deviceId,
      deviceFingerprint,
      platform,
      browser,
      ipAddress: clientIP
    };
    
    await attendance.save();
    
    // Populate user data
    await attendance.populate('user', 'name email department');
    
    // Emit WebSocket event
    if (req.io) {
      req.io.emit('attendance:live-tracking-started', {
        userId,
        userName: attendance.user.name,
        location: { latitude, longitude },
        insideGeofence,
        distanceFromOffice,
        timestamp: new Date()
      });
    }
    
    console.log(`📍 Live tracking started for user ${userId}`);
    
    res.json({
      success: true,
      message: 'Live tracking started successfully',
      data: {
        trackingEnabled: true,
        status: 'Active',
        startedAt: attendance.liveTracking.startedAt,
        updateInterval: attendance.liveTracking.updateInterval,
        currentLocation: {
          latitude,
          longitude,
          insideGeofence,
          distanceFromOffice
        },
        officeLocation: OFFICE_COORDINATES,
        geofenceRadius: OFFICE_RADIUS
      }
    });
    
  } catch (error) {
    console.error('❌ Error starting live tracking:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to start live tracking',
      details: error.message
    });
  }
});

/**
 * @route   POST /api/attendance/live/update/:userId
 * @desc    Update live location for user
 * @access  Private
 */
router.post('/update/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      latitude, 
      longitude, 
      accuracy,
      altitude,
      speed,
      heading,
      batteryLevel,
      networkType
    } = req.body;
    
    // Verify authorization
    if (req.user.id !== userId && req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Not authorized'
      });
    }
    
    // Validate location
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'Location data required'
      });
    }
    
    // Get today's attendance
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const attendance = await Attendance.findOne({
      user: userId,
      date: today
    });
    
    if (!attendance) {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: 'Attendance record not found'
      });
    }
    
    if (!attendance.liveTracking.enabled || attendance.liveTracking.status !== 'Active') {
      return res.status(400).json({
        success: false,
        error: 'TrackingInactive',
        message: 'Live tracking is not active'
      });
    }
    
    // Calculate distance from office
    const distanceFromOffice = calculateDistance(
      latitude,
      longitude,
      OFFICE_COORDINATES.latitude,
      OFFICE_COORDINATES.longitude
    );
    
    const insideGeofence = distanceFromOffice <= OFFICE_RADIUS;
    const wasInsideGeofence = attendance.locationHistory.length > 0 ? 
      attendance.locationHistory[attendance.locationHistory.length - 1].insideGeofence : true;
    
    // Check if user moved enough to warrant an update
    let shouldUpdate = true;
    if (attendance.locationHistory.length > 0) {
      const lastLocation = attendance.locationHistory[attendance.locationHistory.length - 1];
      const distanceMoved = calculateDistance(
        latitude,
        longitude,
        lastLocation.latitude,
        lastLocation.longitude
      );
      
      // Only update if moved more than threshold or geofence status changed
      if (distanceMoved < LOCATION_UPDATE_THRESHOLD && insideGeofence === wasInsideGeofence) {
        shouldUpdate = false;
      }
    }
    
    if (shouldUpdate) {
      // Get client IP
      const clientIP = req.headers['x-forwarded-for'] || 
                       req.connection.remoteAddress || 
                       req.socket.remoteAddress;
      
      // Add location to history
      attendance.locationHistory.push({
        latitude,
        longitude,
        accuracy,
        altitude,
        speed,
        heading,
        timestamp: new Date(),
        insideGeofence,
        distanceFromOffice,
        deviceInfo: {
          ipAddress: clientIP,
          deviceId: attendance.deviceInfo.deviceId
        },
        batteryLevel,
        networkType
      });
      
      // Keep only last 1000 location points to prevent document size issues
      if (attendance.locationHistory.length > 1000) {
        attendance.locationHistory = attendance.locationHistory.slice(-1000);
      }
    }
    
    // Update tracking timestamp
    attendance.liveTracking.lastUpdate = new Date();
    
    // Check for geofence violations
    let alertTriggered = false;
    
    if (wasInsideGeofence && !insideGeofence) {
      // User just left the geofence
      const violation = {
        type: 'Exit',
        timestamp: new Date(),
        location: { latitude, longitude },
        distanceFromOffice,
        duration: 0,
        alerted: false
      };
      
      attendance.geofenceViolations.push(violation);
      
      // Create alert
      const alert = await createLocationAlert(
        userId,
        'Exit',
        { location: { latitude, longitude }, distance: distanceFromOffice },
        req.io
      );
      
      violation.alerted = true;
      violation.alertId = alert._id;
      alertTriggered = true;
      
      // Emit geofence exit event
      if (req.io) {
        req.io.emit('attendance:geofence-exit', {
          userId,
          location: { latitude, longitude },
          distanceFromOffice,
          timestamp: new Date()
        });
      }
      
      console.log(`🚨 Geofence exit detected for user ${userId}`);
    } else if (!wasInsideGeofence && insideGeofence) {
      // User re-entered the geofence
      if (req.io) {
        req.io.emit('attendance:geofence-enter', {
          userId,
          location: { latitude, longitude },
          distanceFromOffice,
          timestamp: new Date()
        });
      }
      
      console.log(`✅ Geofence re-entry detected for user ${userId}`);
    }
    
    await attendance.save();
    
    // Emit location update event
    if (req.io && shouldUpdate) {
      req.io.emit('attendance:location-update', {
        userId,
        location: { latitude, longitude },
        insideGeofence,
        distanceFromOffice,
        accuracy,
        timestamp: new Date()
      });
    }
    
    res.json({
      success: true,
      message: 'Location updated successfully',
      data: {
        insideGeofence,
        distanceFromOffice,
        timestamp: new Date(),
        alertTriggered,
        locationHistoryCount: attendance.locationHistory.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error updating location:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to update location',
      details: error.message
    });
  }
});

/**
 * @route   POST /api/attendance/live/stop/:userId
 * @desc    Stop live location tracking
 * @access  Private
 */
router.post('/stop/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (req.user.id !== userId && req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Not authorized'
      });
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const attendance = await Attendance.findOne({
      user: userId,
      date: today
    });
    
    if (!attendance) {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: 'Attendance record not found'
      });
    }
    
    if (!attendance.liveTracking.enabled) {
      return res.status(400).json({
        success: false,
        error: 'TrackingNotActive',
        message: 'Live tracking is not active'
      });
    }
    
    // Stop tracking
    attendance.liveTracking.status = 'Stopped';
    attendance.liveTracking.stoppedAt = new Date();
    
    await attendance.save();
    
    // Emit WebSocket event
    if (req.io) {
      req.io.emit('attendance:live-tracking-stopped', {
        userId,
        stoppedAt: new Date(),
        totalLocations: attendance.locationHistory.length
      });
    }
    
    console.log(`🛑 Live tracking stopped for user ${userId}`);
    
    res.json({
      success: true,
      message: 'Live tracking stopped successfully',
      data: {
        stoppedAt: attendance.liveTracking.stoppedAt,
        totalLocations: attendance.locationHistory.length,
        violations: attendance.geofenceViolations.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error stopping tracking:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to stop tracking',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/attendance/live/status/:userId
 * @desc    Get current live tracking status
 * @access  Private
 */
router.get('/status/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (req.user.id !== userId && req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Not authorized'
      });
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const attendance = await Attendance.findOne({
      user: userId,
      date: today
    }).select('liveTracking locationHistory geofenceViolations');
    
    if (!attendance) {
      return res.json({
        success: true,
        data: {
          trackingEnabled: false,
          status: 'Inactive'
        }
      });
    }
    
    const lastLocation = attendance.locationHistory.length > 0 ?
      attendance.locationHistory[attendance.locationHistory.length - 1] : null;
    
    res.json({
      success: true,
      data: {
        trackingEnabled: attendance.liveTracking.enabled,
        status: attendance.liveTracking.status,
        startedAt: attendance.liveTracking.startedAt,
        lastUpdate: attendance.liveTracking.lastUpdate,
        updateInterval: attendance.liveTracking.updateInterval,
        lastLocation,
        totalLocations: attendance.locationHistory.length,
        violations: attendance.geofenceViolations.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting tracking status:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to get tracking status',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/attendance/live/history/:userId
 * @desc    Get location history for user
 * @access  Private
 */
router.get('/history/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { date, limit = 100 } = req.query;
    
    if (req.user.id !== userId && req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Not authorized'
      });
    }
    
    const queryDate = date ? new Date(date) : new Date();
    queryDate.setHours(0, 0, 0, 0);
    
    const attendance = await Attendance.findOne({
      user: userId,
      date: queryDate
    }).select('locationHistory liveTracking');
    
    if (!attendance) {
      return res.json({
        success: true,
        data: {
          locations: [],
          count: 0
        }
      });
    }
    
    // Get last N locations
    const locations = attendance.locationHistory.slice(-parseInt(limit));
    
    res.json({
      success: true,
      data: {
        locations,
        count: locations.length,
        totalCount: attendance.locationHistory.length,
        trackingStatus: attendance.liveTracking.status
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting location history:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to get location history',
      details: error.message
    });
  }
});

/**
 * @route   POST /api/attendance/live/geofence/check
 * @desc    Manual geofence check
 * @access  Private
 */
router.post('/geofence/check', auth, async (req, res) => {
  try {
    const { latitude, longitude, userId } = req.body;
    
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'Location coordinates required'
      });
    }
    
    const distance = calculateDistance(
      latitude,
      longitude,
      OFFICE_COORDINATES.latitude,
      OFFICE_COORDINATES.longitude
    );
    
    const insideGeofence = distance <= OFFICE_RADIUS;
    
    res.json({
      success: true,
      data: {
        insideGeofence,
        distance,
        radius: OFFICE_RADIUS,
        officeLocation: OFFICE_COORDINATES,
        userLocation: { latitude, longitude }
      }
    });
    
  } catch (error) {
    console.error('❌ Error checking geofence:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: 'Failed to check geofence',
      details: error.message
    });
  }
});

module.exports = router;
