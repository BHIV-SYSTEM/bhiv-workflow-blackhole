/**
 * Attendance Status Poller
 * 
 * Polls the backend every 30 seconds to check if the employee's workday is active.
 * Automatically starts/stops activity tracking based on backend state.
 * 
 * This enables the following workflow:
 * 1. Employee clicks "Start Day" on Vercel dashboard
 * 2. Backend updates attendance state in database
 * 3. Electron agent polls and detects dayStarted === true
 * 4. Electron automatically starts tracking (no manual click needed)
 * 5. Employee clicks "End Day" on Vercel
 * 6. Electron detects dayStarted === false and stops tracking
 */

const EventEmitter = require('events');

class AttendanceStatusPoller extends EventEmitter {
  constructor(apiService) {
    super();
    this.apiService = apiService;
    this.pollInterval = null;
    this.currentStatus = {
      dayStarted: false,
      attendanceId: null,
      startTime: null
    };
    this.POLL_INTERVAL_MS = 5 * 1000; // 5 seconds - fast detection when employee starts day from web dashboard
  }

  /**
   * Start polling the backend for attendance status
   */
  start() {
    if (this.pollInterval) {
      console.log('⚠️  Poller already running');
      return;
    }

    console.log('🔄 Starting attendance status poller (every 5s)...');
    
    // Poll immediately on start
    this.poll();
    
    // Then poll every 30 seconds
    this.pollInterval = setInterval(() => {
      this.poll();
    }, this.POLL_INTERVAL_MS);
  }

  /**
   * Stop polling
   */
  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('🛑 Stopped attendance status poller');
    }
  }

  /**
   * Poll the backend once
   */
  async poll() {
    try {
      const status = await this.apiService.checkAttendanceStatus();

      // Do not treat temporary network/API errors as an ended workday
      if (status.error) {
        console.warn('⚠️  Skipping attendance state transition due to transient poll error:', status.errorMessage || 'Network error');
        return;
      }
      
      // Detect state changes
      const previouslyStarted = this.currentStatus.dayStarted;
      const nowStarted = status.dayStarted;

      // Update current status
      this.currentStatus = {
        dayStarted: nowStarted,
        attendanceId: status.attendanceId,
        startTime: status.startTime,
        workLocation: status.workLocation,
        userName: status.userName,
        userEmail: status.userEmail
      };

      // Day just started (transition from false → true)
      if (!previouslyStarted && nowStarted) {
        console.log('🟢 Day started detected! Starting activity tracking...');
        this.emit('day-started', {
          attendanceId: status.attendanceId,
          startTime: status.startTime,
          workLocation: status.workLocation,
          userName: status.userName,
          userEmail: status.userEmail
        });
      }

      // Day just ended (transition from true → false)
      if (previouslyStarted && !nowStarted) {
        console.log('🔴 Day ended detected! Stopping activity tracking...');
        this.emit('day-ended');
      }

      // Status unchanged
      if (nowStarted) {
        console.log('✓ Day active (polling...)');
      } else {
        console.log('○ Day not started (polling...)');
      }

    } catch (error) {
      console.error('❌ Polling error:', error.message);
      // Don't emit error - just log it and continue polling
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return this.currentStatus;
  }

  /**
   * Force a status check immediately
   */
  async forceCheck() {
    await this.poll();
    return this.currentStatus;
  }
}

module.exports = AttendanceStatusPoller;
