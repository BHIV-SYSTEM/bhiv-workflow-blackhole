const axios = require('axios');
const fs = require('fs');
const path = require('path');

class ApiService {
  constructor() {
    this.baseURL = this.loadApiBaseUrl();
    this.authToken = null;
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        if (this.authToken) {
          // Backend expects x-auth-token header, not Authorization Bearer
          config.headers['x-auth-token'] = this.authToken;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          // Server responded with error status
          console.error('API Error:', error.response.data);
        } else if (error.request) {
          // Request made but no response
          console.error('Network Error:', error.message);
        } else {
          // Something else happened
          console.error('Error:', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  loadApiBaseUrl() {
    try {
      // Try to load from .env file
      const envPath = path.join(__dirname, '../../.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const match = envContent.match(/AGENT_API_BASE_URL=(.+)/);
        if (match && match[1]) {
          let url = match[1].trim();
          // Remove trailing slashes
          url = url.replace(/\/+$/, '');
          // Remove trailing /api (since all API endpoints already start with /api)
          url = url.replace(/\/api$/, '');
          // Prefer HTTPS for secure domains
          if (url.startsWith('http://niyantran.')) {
            url = url.replace('http://', 'https://');
          }
          console.log('✓ Loaded backend URL from .env:', url);
          return url;
        }
      } else {
        console.log('⚠ .env file not found at:', envPath);
      }
    } catch (error) {
      console.error('Error loading .env file:', error);
    }

    // Fallback to default or environment variable (Niyantran server listens on 5000)
    const fallbackUrl = process.env.AGENT_API_BASE_URL || 'http://127.0.0.1:5000';
    console.log('Using fallback backend URL:', fallbackUrl);
    return fallbackUrl;
  }

  setAuthToken(token) {
    this.authToken = token;
  }

  /**
   * Login to the backend
   * @param {Object} credentials - { email, password }
   * @returns {Promise<Object>} - { success, token, user, error }
   */
  async login(credentials) {
    try {
      console.log('🔐 Attempting login with:', { 
        email: credentials.email, 
        passwordLength: credentials.password?.length,
        url: `${this.baseURL}/api/auth/login`
      });
      
      const response = await this.client.post('/api/auth/login', credentials);
      
      console.log('✅ Login response:', { 
        hasToken: !!response.data?.token,
        hasUser: !!response.data?.user 
      });
      
      if (response.data && response.data.token) {
        return {
          success: true,
          token: response.data.token,
          user: response.data.user || { email: credentials.email }
        };
      }

      return {
        success: false,
        error: 'Invalid response from server'
      };
    } catch (error) {
      console.error('❌ Login error:', {
        status: error.response?.status,
        message: error.response?.data?.error || error.message
      });
      
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Login failed'
      };
    }
  }

  /**
   * Start the work day
   * @returns {Promise<Object>} - { success, attendanceId, error }
   */
  async startDay() {
    try {
      // Get user ID from stored token
      const userId = this.getUserIdFromToken();
      if (!userId) {
        return {
          success: false,
          error: 'User not authenticated'
        };
      }

      // Use sample location data for desktop agent (work from home mode)
      // Using generic coordinates - can be replaced with actual geolocation API later
      const locationData = {
        latitude: 40.7128,  // Sample latitude (New York City)
        longitude: -74.0060, // Sample longitude (New York City)
        address: 'Work From Home - Desktop Agent',
        accuracy: 10,
        workFromHome: true,
        homeLocation: { 
          latitude: 40.7128, 
          longitude: -74.0060 
        }
      };

      const response = await this.client.post(`/api/attendance/start-day/${userId}`, locationData);
      
      if (response.data && (response.data.success !== false)) {
        return {
          success: true,
          attendanceId: response.data.attendanceId || response.data.attendance?._id || response.data._id
        };
      }

      return {
        success: false,
        error: response.data?.error || response.data?.message || 'Failed to start day'
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to start day'
      };
    }
  }

  /**
   * Extract user ID from JWT token
   */
  getUserIdFromToken() {
    if (!this.authToken) return null;
    
    try {
      // JWT tokens have 3 parts: header.payload.signature
      const parts = this.authToken.split('.');
      if (parts.length !== 3) return null;
      
      // Decode the payload (base64)
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      
      // Backend JWT structure: { id, name, email, role, department, branch }
      return payload.id || payload.user?.id || payload.userId || payload.sub;
    } catch (error) {
      console.error('Error decoding token:', error);
      return null;
    }
  }

  /**
   * End the work day
   * @returns {Promise<Object>} - { success, error }
   */
  async endDay() {
    try {
      // Get user ID from stored token
      const userId = this.getUserIdFromToken();
      if (!userId) {
        return {
          success: false,
          error: 'User not authenticated'
        };
      }

      // Use sample location data for desktop agent (work from home mode)
      const locationData = {
        latitude: 40.7128,  // Sample latitude (New York City)
        longitude: -74.0060, // Sample longitude (New York City)
        address: 'Work From Home - Desktop Agent',
        accuracy: 10
      };

      const response = await this.client.post(`/api/attendance/end-day/${userId}`, locationData);
      
      if (response.data && (response.data.success !== false || response.status === 200)) {
        // Keep web WorkHoursManager WorkSession synced cleanly (best-effort)
        try {
          await this.client.post('/api/monitoring/work-session/end', { employeeId: userId });
        } catch (syncErr) {
          // Ignore if no monitoring WorkSession existed
        }
        return {
          success: true,
          message: response.data?.message || 'Work day ended successfully!',
          data: response.data?.data || null
        };
      }

      return {
        success: false,
        code: response.data?.code,
        error: response.data?.error || response.data?.message || 'Failed to end day'
      };
    } catch (error) {
      const errData = error.response?.data || {};
      const errMsg = errData.error || errData.message || error.message || 'Failed to end day';

      if (errData.code === 'PROGRESS_NOT_SET' || /daily progress/i.test(errMsg)) {
        return {
          success: false,
          code: 'PROGRESS_NOT_SET',
          error: errMsg
        };
      }

      // If attendance day wasn't created via attendance route, try monitoring work-session fallback
      if (errData.code === 'DAY_NOT_STARTED') {
        try {
          const userId = this.getUserIdFromToken();
          const wsRes = await this.client.post('/api/monitoring/work-session/end', { employeeId: userId });
          if (wsRes.data && (wsRes.data.success !== false || wsRes.status === 200)) {
            return {
              success: true,
              message: wsRes.data?.message || 'Work session ended successfully!',
              data: wsRes.data?.data || null
            };
          }
        } catch (wsErr) {
          const wsData = wsErr.response?.data || {};
          const wsMsg = wsData.error || wsData.message || errMsg;
          return {
            success: false,
            code: wsData.code || errData.code,
            error: wsMsg
          };
        }
      }

      return {
        success: false,
        code: errData.code,
        error: errMsg
      };
    }
  }

  getUserFromToken() {
    try {
      if (!this.authToken) return null;
      const parts = this.authToken.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      // Backend JWT is flat: { id, name, email, role, department, branch }
      return {
        id: payload.id || payload.user?.id || payload.userId,
        name: payload.name || payload.user?.name,
        email: payload.email || payload.user?.email,
        role: payload.role || payload.user?.role
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Check attendance status for today (POLLING ENDPOINT)
   * This is called every 30 seconds by the attendance poller
   * @returns {Promise<Object>} - { dayStarted, attendanceId, startTime, workLocation, userName, userEmail }
   */
  async checkAttendanceStatus() {
    try {
      const response = await this.client.get('/api/attendance/status');
      const tokenUser = this.getUserFromToken();
      
      return {
        dayStarted: response.data.dayStarted || false,
        attendanceId: response.data.attendanceId || null,
        startTime: response.data.startTime || null,
        workLocation: response.data.workLocation || null,
        userName: response.data.userName || tokenUser?.name || null,
        userEmail: response.data.userEmail || tokenUser?.email || null
      };
    } catch (error) {
      console.error('❌ Failed to check attendance status:', error.response?.data || error.message);
      const tokenUser = this.getUserFromToken();
      return { 
        dayStarted: false,
        attendanceId: null,
        startTime: null,
        userName: tokenUser?.name || null,
        userEmail: tokenUser?.email || null
      };
    }
  }

  /**
   * Send activity data to the backend
   * @param {Object} activityData - Activity tracking data
   * @returns {Promise<Object>} - { success, error }
   */
  async ingestActivity(activityData) {
    try {
      const response = await this.client.post('/api/agent/activity/ingest', activityData);
      
      if (response.data && (response.data.success || response.status === 200)) {
        return {
          success: true
        };
      }

      // Non-success responses must throw so the activity tracker's catch path
      // runs (403 => stop tracking, otherwise buffer for retry). Returning
      // {success:false} here silently skipped every offline-buffer/retry path.
      const failure = new Error(response.data?.error || response.data?.message || 'Failed to ingest activity');
      failure.response = response;
      throw failure;
    } catch (error) {
      if (error.response) {
        // Server rejection (403 day-not-active/paused, 400 validation, 500...)
        console.error('Activity ingestion failed:', error.response.data?.error || error.message);
        if (!error.response.data) {
          error.response.data = {};
        }
        if (!error.response.data.error) {
          error.response.data.error = error.message;
        }
        throw error;
      }
      // Network-level failure: also throw so the caller buffers instead of dropping.
      console.error('Activity ingestion failed:', error.message);
      throw error;
    }
  }

  /**
   * TRINETRA capture policy for this device.
   * @returns {Promise<Object|null>}
   */
  async fetchAgentConfig() {
    try {
      const response = await this.client.get('/api/trinetra/agent/config');
      return response.data || null;
    } catch (error) {
      console.warn('Failed to fetch capture policy:', error.response?.data?.error || error.message);
      return null;
    }
  }

  /**
   * Tasks assigned to the signed-in employee (for the active-task selector).
   * @returns {Promise<Object>} - { success, tasks, aims }
   */
  async fetchMyTasks() {
    try {
      const response = await this.client.get('/api/trinetra/agent/tasks');
      return {
        success: true,
        tasks: response.data?.tasks || [],
        aims: response.data?.aims || []
      };
    } catch (error) {
      return {
        success: false,
        tasks: [],
        aims: [],
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Upload a periodic screen capture.
   * @param {Object} payload - { image(base64), signature, capturedAt, ... }
   * @returns {Promise<Object>} - { success, stored, skipped, error }
   */
  async uploadScreenshot(payload) {
    try {
      const response = await this.client.post('/api/trinetra/agent/screenshot', payload, {
        // Screenshots are larger than telemetry; allow more time on slow links.
        timeout: 60000,
        maxBodyLength: 10 * 1024 * 1024,
        maxContentLength: 10 * 1024 * 1024
      });
      return {
        success: response.data?.success !== false,
        stored: !!response.data?.stored,
        skipped: response.data?.skipped || null,
        screenshotId: response.data?.screenshot_id || null
      };
    } catch (error) {
      return {
        success: false,
        error:
          error.response?.data?.error ||
          error.response?.data?.message ||
          error.message ||
          'Failed to upload screenshot'
      };
    }
  }

  /**
   * Verify authentication token
   * @returns {Promise<Object>} - { valid, user, error }
   */
  async verifyToken() {
    try {
      const response = await this.client.get('/api/agent/verify');
      
      if (response.data && response.data.valid) {
        return {
          valid: true,
          user: response.data.user
        };
      }

      return {
        valid: false
      };
    } catch (error) {
      return {
        valid: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Fetch today's authoritative work & active time summary from backend
   * @returns {Promise<Object>} - { success, summary, error }
   */
  async getDailySummary() {
    try {
      const userId = this.getUserIdFromToken();
      if (!userId) {
        return { success: false, error: 'User not authenticated' };
      }

      const response = await this.client.get(`/api/users/${userId}/daily-summary`);
      return {
        success: true,
        summary: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Submit daily progress quickly from desktop agent (unlocks End Day when PROGRESS_NOT_SET)
   * @param {Object} payload - { taskId, progressPercentage, notes, achievements, blockers }
   * @returns {Promise<Object>} - { success, progress, error }
   */
  async submitProgress(payload) {
    try {
      const userId = this.getUserIdFromToken();
      if (!userId) {
        return { success: false, error: 'User not authenticated' };
      }

      const response = await this.client.post('/api/progress', {
        user: userId,
        task: payload.taskId,
        progressPercentage: Number(payload.progressPercentage ?? 50),
        notes: (payload.notes || '').trim(),
        achievements: (payload.achievements || '').trim(),
        blockers: (payload.blockers || '').trim()
      });

      return {
        success: true,
        progress: response.data
      };
    } catch (error) {
      const errData = error.response?.data;
      const firstValidation = Array.isArray(errData?.errors) && errData.errors[0]?.msg;
      return {
        success: false,
        error: firstValidation || errData?.error || errData?.msg || errData?.message || error.message || 'Failed to save daily progress'
      };
    }
  }
}

module.exports = ApiService;
