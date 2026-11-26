const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { resolveLocation, isNearOffice } = require('../utils/geolocation');

function normalizeBaseUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let normalized = url.trim().replace(/\/+$/, '');
  if (!normalized) return null;
  // All API calls already include the /api prefix.
  normalized = normalized.replace(/\/api$/, '');
  if (normalized.startsWith('http://niyantran.')) {
    normalized = normalized.replace('http://', 'https://');
  }
  return normalized;
}

class ApiService {
  constructor() {
    const configuredUrl = this.loadApiBaseUrl();
    // The packaged agent may not ship a .env. Try the explicitly configured
    // server first, then the environment-appropriate default, then the other
    // known backend. Whichever accepts the credentials becomes the agent's
    // permanent backend for the rest of the session.
    this.loginCandidates = this.buildLoginCandidates(configuredUrl);
    this.baseURL = this.loginCandidates[0] || 'http://127.0.0.1:5000';
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
        const fromFile = normalizeBaseUrl(match && match[1]);
        if (fromFile) {
          console.log('✓ Loaded backend URL from .env:', fromFile);
          return fromFile;
        }
      } else {
        console.log('⚠ .env file not found at:', envPath);
      }
    } catch (error) {
      console.error('Error loading .env file:', error);
    }

    const fromEnv = normalizeBaseUrl(process.env.AGENT_API_BASE_URL);
    if (fromEnv) {
      console.log('✓ Loaded backend URL from environment:', fromEnv);
      return fromEnv;
    }

    console.log('⚠ No explicit backend URL configured; login will probe known servers.');
    return null;
  }

  buildLoginCandidates(configuredUrl) {
    const candidates = [];
    const add = (url) => {
      const normalized = normalizeBaseUrl(url);
      if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
    };

    add(configuredUrl);

    // A packaged install normally talks to production; a dev/source run talks
    // to the local backend first. The other server is still probed as a
    // fallback so a missing .env or a locally running server never strands
    // the operator on the wrong database.
    if (this.isPackagedApp()) {
      add('https://niyantran.blackholeinfiverse.com');
      add('http://127.0.0.1:5000');
    } else {
      add('http://127.0.0.1:5000');
      add('https://niyantran.blackholeinfiverse.com');
    }

    return candidates;
  }

  isPackagedApp() {
    try {
      const electron = require('electron');
      return Boolean(electron && electron.app && electron.app.isPackaged);
    } catch {
      return false;
    }
  }

  setBaseUrl(url) {
    const normalized = normalizeBaseUrl(url);
    if (normalized && normalized !== this.baseURL) {
      this.baseURL = normalized;
      this.client.defaults.baseURL = normalized;
      console.log('✓ Using backend URL:', normalized);
    }
    if (normalized) {
      // The working backend always becomes the first login candidate, so a
      // later restart keeps talking to the same database the token came from.
      this.loginCandidates = [
        normalized,
        ...this.loginCandidates.filter((candidate) => candidate !== normalized),
      ];
    }
  }

  getBaseUrl() {
    return this.baseURL;
  }

  /**
   * Ask the current backend whether it actually knows this token's account.
   *
   * JWTs can be accepted by more than one deployment when JWT_SECRET is
   * shared, which previously let the agent restore a session against a
   * database that has no record of the employee. `/api/auth/me` returns 404
   * when the account does not exist on that backend.
   */
  async verifySession() {
    try {
      const response = await this.client.get('/api/auth/me');
      const user = response.data || null;
      if (user && (user._id || user.id)) {
        return { valid: true, user };
      }
      return { valid: false, status: response.status, error: 'Session verification failed' };
    } catch (error) {
      if (!error.response) {
        // No HTTP response at all — unreachable backend, not an auth verdict.
        return { valid: false, network: true, error: error.message };
      }
      return {
        valid: false,
        status: error.response.status,
        error: error.response.data?.error || error.message,
      };
    }
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
    const attempts = [];

    for (const baseUrl of this.loginCandidates) {
      try {
        console.log('🔐 Attempting login at:', baseUrl, 'for:', credentials.email);

        const response = await this.client.post(
          `${baseUrl}/api/auth/login`,
          credentials,
          { timeout: 10000 }
        );

        if (response.data && response.data.token) {
          // Use the same backend for every other agent API call. This is the
          // key fix for "Invalid credentials" caused by the packaged app
          // defaulting to a different database than the web app.
          this.setBaseUrl(baseUrl);
          console.log('✅ Login successful at:', baseUrl);
          return {
            success: true,
            token: response.data.token,
            user: response.data.user || { email: credentials.email }
          };
        }

        attempts.push({ baseUrl, status: response.status, error: 'Invalid response from server' });
      } catch (error) {
        const status = error.response?.status;
        const message = error.response?.data?.error || error.message || 'Login failed';
        attempts.push({ baseUrl, status, error: message });
        console.warn(`⚠ Login attempt failed at ${baseUrl}:`, message);
      }
    }

    // Never stop at the first rejection: one backend can hold a deactivated
    // copy of an email while the backend the operator actually uses has the
    // account active. Prefer a definitive 4xx answer over a network failure
    // and always name the backend that produced it.
    const definitive = attempts.find((attempt) => attempt.status >= 400 && attempt.status < 500);
    const primary = definitive || attempts[attempts.length - 1];

    return {
      success: false,
      error: primary
        ? `${primary.error} (backend: ${primary.baseUrl})`
        : 'Login failed',
      attempts
    };
  }

  /**
   * Start the work day
   * @param {Object} options - Optional { previousDayProgressReason }
   * @returns {Promise<Object>} - { success, attendanceId, aimReminder, aimReminderMessage, code, error }
   */
  async startDay(options = {}) {
    try {
      // Refresh server-side presence immediately. The backend requires a
      // fresh V1 heartbeat before it accepts a laptop/PC start request.
      await this.sendHeartbeat();

      // Get user ID from stored token
      const userId = this.getUserIdFromToken();
      if (!userId) {
        return {
          success: false,
          error: 'User not authenticated'
        };
      }

      // Resolve the operator's real location instead of sample coordinates.
      const location = await resolveLocation();
      if (!location) {
        return {
          success: false,
          error:
            'Location unavailable. Allow location access in Windows Settings (Settings > Privacy > Location) or connect to the internet, then try again.'
        };
      }

      // Only report Office when the fix came from the Windows Location API and we
      // are genuinely inside the office radius; otherwise treat it as work-from-home
      // so the server never rejects the day with LOCATION_TOO_FAR.
      const atOffice = location.source === 'windows' && isNearOffice(location.latitude, location.longitude);

        const locationData = {
          latitude: location.latitude,
          longitude: location.longitude,
          address: location.address,
          accuracy: location.accuracy,
          deviceInfo: { deviceType: 'desktop', userAgent: 'Niyantran Desktop Agent' },
          ...(options?.previousDayProgressReason
            ? { previousDayProgressReason: String(options.previousDayProgressReason).trim() }
            : {})
        };
        if (atOffice) {
          locationData.workFromHome = false;
        } else {
          locationData.workFromHome = true;
          locationData.homeLocation = {
            latitude: location.latitude,
            longitude: location.longitude
          };
        }

      const response = await this.client.post(`/api/attendance/start-day/${userId}`, locationData);
      
      if (response.data && (response.data.success !== false)) {
        const startTime =
          response.data.startTime ||
          response.data.attendance?.startDayTime ||
          new Date().toISOString();
        const attendanceId =
          response.data.attendanceId || response.data.attendance?._id || response.data._id;

        // Keep web WorkHoursManager WorkSession synced cleanly (best-effort)
        try {
          await this.client.post('/api/monitoring/work-session/start', {
            employeeId: userId,
            startTime
          });
        } catch (syncErr) {
          // Non-fatal if WorkSession already started
        }

        return {
          success: true,
          attendanceId,
          startTime,
          hasAimToday: Boolean(response.data.hasAimToday),
          aimReminder: Boolean(response.data.aimReminder),
          aimReminderMessage: response.data.aimReminderMessage || null
        };
      }

      return {
        success: false,
        code: response.data?.code,
        error: response.data?.error || response.data?.message || 'Failed to start day'
      };
    } catch (error) {
      const errData = error.response?.data || {};
      if (errData.code === 'PREVIOUS_DAY_PROGRESS_REASON_REQUIRED') {
        return {
          success: false,
          code: 'PREVIOUS_DAY_PROGRESS_REASON_REQUIRED',
          error: errData.error || "Why was the previous day's progress not updated?",
          previousDateLabel: errData.previousDateLabel || null,
          minLength: errData.minLength || 10
        };
      }
      return {
        success: false,
        code: errData.code,
        error: errData.error || errData.message || error.message || 'Failed to start day'
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

      // End the day at the operator's real location (best effort).
      const endLocation = await resolveLocation();
      const locationData = endLocation
        ? {
            latitude: endLocation.latitude,
            longitude: endLocation.longitude,
            address: endLocation.address,
            accuracy: endLocation.accuracy
          }
        : {};

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
          progressReminder: Boolean(response.data?.progressReminder || response.data?.data?.progressReminder),
          reminderMessage: response.data?.reminderMessage || response.data?.data?.reminderMessage || null,
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
      const errMsg = errData.details || errData.error || errData.message || error.message || 'Failed to end day';

      if (errData.code === 'PROGRESS_NOT_SET' || /daily progress/i.test(errMsg)) {
        return {
          success: false,
          code: 'PROGRESS_NOT_SET',
          error: errMsg
        };
      }

      // If attendance day wasn't created via attendance route or already ended, sync monitoring work-session fallback
      if (errData.code === 'DAY_NOT_STARTED' || errData.code === 'DAY_ALREADY_ENDED') {
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
          if (errData.code === 'DAY_ALREADY_ENDED' && wsData.code === 'SESSION_ALREADY_ENDED') {
            return {
              success: true,
              message: 'Work day already ended.'
            };
          }
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
        dayEndedToday: response.data.dayEndedToday || false,
        attendanceId: response.data.attendanceId || null,
        startTime: response.data.startTime || null,
        endTime: response.data.endTime || null,
        workLocation: response.data.workLocation || null,
        userName: response.data.userName || tokenUser?.name || null,
        userEmail: response.data.userEmail || tokenUser?.email || null
      };
    } catch (error) {
      console.error('❌ Failed to check attendance status:', error.response?.data || error.message);
      const tokenUser = this.getUserFromToken();
      return { 
        error: true,
        errorMessage: error.response?.data?.error || error.message,
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
   * Upload reconstructed typed-text segments (sentences) to the backend.
   * The server re-validates consent/day and classifies each segment
   * (valuable vs key-mashing) before storing.
   * @param {Object} payload - { attendanceId, segments[], activeApp, ... }
   * @returns {Promise<Object>} - { success, stored, error }
   */
  async ingestKeystrokes(payload) {
    try {
      const response = await this.client.post('/api/agent/keystroke/ingest', payload);
      if (response.data && (response.data.success || response.status === 200)) {
        return {
          success: true,
          stored: response.data.stored || 0,
          classifications: response.data.classifications || {}
        };
      }
      const failure = new Error(response.data?.error || 'Failed to ingest keystroke data');
      failure.response = response;
      throw failure;
    } catch (error) {
      if (error.response) {
        console.error('Keystroke ingestion failed:', error.response.data?.error || error.message);
        if (!error.response.data) error.response.data = {};
        if (!error.response.data.error) error.response.data.error = error.message;
        throw error;
      }
      console.error('Keystroke ingestion failed:', error.message);
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
   * Send a heartbeat to the server so the web app knows this desktop agent is
   * installed and online for the logged-in user.
   * @returns {Promise<Object>}
   */
  async sendHeartbeat() {
    try {
      const version = (typeof process !== 'undefined' && process.env && process.env.npm_package_version) ? process.env.npm_package_version : '1.0.0';
      const response = await this.client.post('/api/agent/heartbeat', { version });
      return response.data || { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || error.message };
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
