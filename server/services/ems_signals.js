/**
 * EMS Signal Layer - Day 1 Implementation
 * Captures real-time employee activity signals for monitoring
 * 
 * Signal Types:
 * - window_focus: Detects if window is active/background
 * - keystroke_rate: Measures typing activity
 * - mouse_movement: Tracks mouse engagement
 * - scroll_depth: Monitors content interaction
 * - task_tab_active: Verifies if work tab is active
 * - idle_time: Detects inactivity periods
 * - app_switch: Tracks application switching
 * - browser_hidden: Detects when browser is minimized/hidden
 */

const EventEmitter = require('events');
const EmployeeActivity = require('../models/EmployeeActivity');
const MonitoringAlert = require('../models/MonitoringAlert');
const WorkSession = require('../models/WorkSession');

class EMSSignalLayer extends EventEmitter {
  constructor() {
    super();
    
    // Signal storage per employee
    this.employeeSignals = new Map();
    
    // Signal thresholds and configurations
    this.config = {
      keystrokeThreshold: 30, // keystrokes per minute for "active"
      mouseMovementThreshold: 20, // movements per minute
      idleThreshold: 120000, // 2 minutes in milliseconds
      signalBufferSize: 100, // Keep last 100 signals per employee
      flushInterval: 10000, // Flush signals every 10 seconds
    };

    // Start periodic signal analysis
    this.startSignalProcessor();
    
    console.log('🚀 [EMS] Signal Layer initialized');
  }

  /**
   * Initialize employee signal tracking
   */
  initializeEmployee(employeeId, sessionId) {
    if (!this.employeeSignals.has(employeeId)) {
      const signalData = {
        employeeId,
        sessionId,
        startTime: Date.now(),
        signals: [],
        currentState: {
          window_focus: true,
          keystroke_rate: 0,
          mouse_movement: 0,
          scroll_depth: 0,
          task_tab_active: true,
          idle_time: 0,
          app_switch_count: 0,
          browser_hidden: false,
        },
        realtime: {
          lastKeystroke: Date.now(),
          lastMouseMove: Date.now(),
          lastScrollEvent: Date.now(),
          lastFocusChange: Date.now(),
          keystrokeBuffer: [],
          mouseBuffer: [],
          scrollBuffer: [],
          intervalKeystrokes: 0,
          intervalMouseEvents: 0,
        }
      };

      this.employeeSignals.set(employeeId, signalData);
      
      console.log(`✅ [EMS] Employee ${employeeId} signal tracking initialized`);
      this.emit('employee-initialized', { employeeId, sessionId });
    }
  }

  /**
   * SIGNAL 1: Window Focus Detection
   * Captures when window/tab loses or gains focus
   */
  captureWindowFocus(employeeId, isFocused, metadata = {}) {
    const employee = this.employeeSignals.get(employeeId);
    if (!employee) return;

    const signal = {
      type: 'window_focus',
      timestamp: Date.now(),
      value: isFocused,
      meaning: isFocused ? 'working' : 'background',
      metadata: {
        previousState: employee.currentState.window_focus,
        duration: Date.now() - employee.realtime.lastFocusChange,
        ...metadata
      }
    };

    employee.currentState.window_focus = isFocused;
    employee.realtime.lastFocusChange = Date.now();
    this.addSignal(employeeId, signal);

    console.log(`🔍 [SIGNAL] window_focus - Employee ${employeeId}: ${signal.meaning}`);
    this.emit('signal-captured', { employeeId, signal });
  }

  /**
   * SIGNAL 2: Keystroke Rate Detection
   * Measures real typing activity
   */
  /**
   * SIGNAL 2: Keystroke Rate Detection
   * Measures real typing activity
   */
  captureKeystroke(employeeId, keystrokeData = {}) {
    const employee = this.employeeSignals.get(employeeId);
    if (!employee) return;

    const count = Math.max(1, parseInt(keystrokeData.count || keystrokeData.keystroke_count || 1, 10));
    const now = Date.now();

    // Accumulate actual keystrokes for the current 30s interval
    employee.realtime.intervalKeystrokes = (employee.realtime.intervalKeystrokes || 0) + count;
    employee.realtime.lastKeystroke = now;

    // Buffer timestamps for sliding-window rate calculation (up to count, capped at 60)
    const samplesToPush = Math.min(count, 60);
    for (let i = 0; i < samplesToPush; i++) {
      employee.realtime.keystrokeBuffer.push(now);
    }

    // Calculate keystrokes per minute (last 60 seconds)
    const oneMinuteAgo = now - 60000;
    employee.realtime.keystrokeBuffer = employee.realtime.keystrokeBuffer.filter(
      timestamp => timestamp > oneMinuteAgo
    );
    
    const keystrokesPerMinute = employee.realtime.keystrokeBuffer.length;
    
    const signal = {
      type: 'keystroke_rate',
      timestamp: now,
      value: keystrokesPerMinute,
      meaning: keystrokesPerMinute >= this.config.keystrokeThreshold ? 'real_activity' : 'low_activity',
      metadata: {
        key: keystrokeData.key || 'unknown',
        count: count,
        intervalTotal: employee.realtime.intervalKeystrokes,
        isTyping: keystrokesPerMinute > 0,
        burstMode: keystrokesPerMinute > 60,
        ...keystrokeData
      }
    };

    employee.currentState.keystroke_rate = keystrokesPerMinute;
    this.addSignal(employeeId, signal);

    console.log(`⌨️  [SIGNAL] keystroke_rate - Employee ${employeeId}: +${count} keys (interval: ${employee.realtime.intervalKeystrokes}, rate: ${keystrokesPerMinute}/min) - ${signal.meaning}`);
    this.emit('signal-captured', { employeeId, signal });
  }

  /**
   * SIGNAL 3: Mouse Movement Detection
   * Tracks engagement through mouse activity
   */
  captureMouseMovement(employeeId, mouseData = {}) {
    const employee = this.employeeSignals.get(employeeId);
    if (!employee) return;

    const count = Math.max(1, parseInt(mouseData.count || mouseData.events || mouseData.mouse_events || 1, 10));
    const now = Date.now();

    // Accumulate actual mouse events for the current 30s interval
    employee.realtime.intervalMouseEvents = (employee.realtime.intervalMouseEvents || 0) + count;
    employee.realtime.lastMouseMove = now;

    // Buffer samples for sliding-window calculation
    const samplesToPush = Math.min(count, 30);
    for (let i = 0; i < samplesToPush; i++) {
      employee.realtime.mouseBuffer.push({
        timestamp: now,
        x: mouseData.x || 0,
        y: mouseData.y || 0,
        type: mouseData.type || 'move'
      });
    }

    // Calculate movements per minute
    const oneMinuteAgo = now - 60000;
    employee.realtime.mouseBuffer = employee.realtime.mouseBuffer.filter(
      event => event.timestamp > oneMinuteAgo
    );
    
    const movementsPerMinute = employee.realtime.mouseBuffer.length;
    
    const signal = {
      type: 'mouse_movement',
      timestamp: now,
      value: movementsPerMinute,
      meaning: movementsPerMinute >= this.config.mouseMovementThreshold ? 'engagement' : 'low_engagement',
      metadata: {
        count: count,
        intervalTotal: employee.realtime.intervalMouseEvents,
        x: mouseData.x,
        y: mouseData.y,
        eventType: mouseData.type,
        velocity: this.calculateMouseVelocity(employee.realtime.mouseBuffer),
        ...mouseData
      }
    };

    employee.currentState.mouse_movement = movementsPerMinute;
    this.addSignal(employeeId, signal);

    console.log(`🖱️  [SIGNAL] mouse_movement - Employee ${employeeId}: +${count} events (interval: ${employee.realtime.intervalMouseEvents}, rate: ${movementsPerMinute}/min) - ${signal.meaning}`);
    this.emit('signal-captured', { employeeId, signal });
  }

  /**
   * SIGNAL 4: Scroll Depth Detection
   * Monitors content interaction through scrolling
   */
  captureScrollDepth(employeeId, scrollData = {}) {
    const employee = this.employeeSignals.get(employeeId);
    if (!employee) return;

    const now = Date.now();
    const scrollPercentage = scrollData.percentage || 0;
    
    employee.realtime.scrollBuffer.push({
      timestamp: now,
      percentage: scrollPercentage,
      direction: scrollData.direction || 'down'
    });
    employee.realtime.lastScrollEvent = now;

    // Keep last minute of scroll events
    const oneMinuteAgo = now - 60000;
    employee.realtime.scrollBuffer = employee.realtime.scrollBuffer.filter(
      event => event.timestamp > oneMinuteAgo
    );
    
    const scrollEvents = employee.realtime.scrollBuffer.length;
    
    const signal = {
      type: 'scroll_depth',
      timestamp: now,
      value: scrollPercentage,
      meaning: scrollEvents > 0 ? 'content_interaction' : 'no_interaction',
      metadata: {
        percentage: scrollPercentage,
        direction: scrollData.direction,
        scrollEventsPerMinute: scrollEvents,
        documentHeight: scrollData.documentHeight,
        viewportHeight: scrollData.viewportHeight,
        ...scrollData
      }
    };

    employee.currentState.scroll_depth = scrollPercentage;
    this.addSignal(employeeId, signal);

    console.log(`📜 [SIGNAL] scroll_depth - Employee ${employeeId}: ${scrollPercentage}% - ${signal.meaning}`);
    this.emit('signal-captured', { employeeId, signal });
  }

  /**
   * SIGNAL 5: Task Tab Active Detection
   * Verifies if the active tab is work-related
   */
  captureTaskTabActive(employeeId, tabData = {}) {
    const employee = this.employeeSignals.get(employeeId);
    if (!employee) return;

    const isWorkTab = this.isWorkRelatedTab(tabData.url, tabData.title);
    
    const signal = {
      type: 'task_tab_active',
      timestamp: Date.now(),
      value: isWorkTab,
      meaning: isWorkTab ? 'real_task' : 'non_task',
      metadata: {
        url: tabData.url,
        title: tabData.title,
        domain: tabData.domain,
        tabId: tabData.tabId,
        isActive: tabData.isActive,
        ...tabData
      }
    };

    employee.currentState.task_tab_active = isWorkTab;
    this.addSignal(employeeId, signal);

    console.log(`📑 [SIGNAL] task_tab_active - Employee ${employeeId}: ${signal.meaning} - ${tabData.url}`);
    this.emit('signal-captured', { employeeId, signal });
  }

  /**
   * SIGNAL 6: Idle Time Detection
   * Detects periods of inactivity
   */
  captureIdleTime(employeeId) {
    const employee = this.employeeSignals.get(employeeId);
    if (!employee) return;

    const now = Date.now();
    const lastActivity = Math.max(
      employee.realtime.lastKeystroke,
      employee.realtime.lastMouseMove,
      employee.realtime.lastScrollEvent
    );
    
    const idleTime = now - lastActivity;
    const isIdle = idleTime >= this.config.idleThreshold;
    
    // Purge sliding buffers older than 60s and update live rates
    const oneMinuteAgo = now - 60000;
    employee.realtime.keystrokeBuffer = (employee.realtime.keystrokeBuffer || []).filter(
      timestamp => timestamp > oneMinuteAgo
    );
    employee.realtime.mouseBuffer = (employee.realtime.mouseBuffer || []).filter(
      event => event.timestamp > oneMinuteAgo
    );
    employee.currentState.keystroke_rate = employee.realtime.keystrokeBuffer.length;
    employee.currentState.mouse_movement = employee.realtime.mouseBuffer.length;

    const signal = {
      type: 'idle_time',
      timestamp: now,
      value: idleTime,
      meaning: isIdle ? 'inactivity' : 'active',
      metadata: {
        idleSeconds: Math.floor(idleTime / 1000),
        lastActivity: lastActivity,
        threshold: this.config.idleThreshold,
        isIdle: isIdle
      }
    };

    employee.currentState.idle_time = idleTime;
    this.addSignal(employeeId, signal);

    if (isIdle) {
      console.log(`💤 [SIGNAL] idle_time - Employee ${employeeId}: ${Math.floor(idleTime/1000)}s - ${signal.meaning}`);

      // TANTRA ecosystem: publish event to the bus (fire-and-forget — must never break EMS signals)
      try {
        const eventBus = require('./eventBus');
        eventBus.publish('excessive_idle', {
          employeeId,
          idleMinutes: idleTime / 60000
        }).catch(err => console.warn('[eventBus] Publish excessive_idle via EMS failed (non-fatal):', err.message));
      } catch (e) { /* eventBus load failure is non-fatal */ }
    }
    
    this.emit('signal-captured', { employeeId, signal });
  }

  /**
   * SIGNAL 7: App Switch Detection
   * Tracks application/window switching
   */
  captureAppSwitch(employeeId, appData = {}) {
    const employee = this.employeeSignals.get(employeeId);
    if (!employee) return;

    employee.currentState.app_switch_count++;
    
    const signal = {
      type: 'app_switch',
      timestamp: Date.now(),
      value: employee.currentState.app_switch_count,
      meaning: 'distraction',
      metadata: {
        fromApp: appData.fromApp,
        toApp: appData.toApp,
        fromTitle: appData.fromTitle,
        toTitle: appData.toTitle,
        switchCount: employee.currentState.app_switch_count,
        isWorkApp: this.isWorkRelatedApp(appData.toApp),
        ...appData
      }
    };

    this.addSignal(employeeId, signal);

    console.log(`🔄 [SIGNAL] app_switch - Employee ${employeeId}: ${appData.fromApp} → ${appData.toApp} (${signal.meaning})`);
    this.emit('signal-captured', { employeeId, signal });
  }

  /**
   * SIGNAL 8: Browser Hidden Detection
   * Detects when browser is minimized or hidden
   */
  captureBrowserHidden(employeeId, isHidden, metadata = {}) {
    const employee = this.employeeSignals.get(employeeId);
    if (!employee) return;

    const signal = {
      type: 'browser_hidden',
      timestamp: Date.now(),
      value: isHidden,
      meaning: isHidden ? 'pretending' : 'visible',
      metadata: {
        visibilityState: metadata.visibilityState || 'unknown',
        documentHidden: isHidden,
        reason: metadata.reason,
        ...metadata
      }
    };

    employee.currentState.browser_hidden = isHidden;
    this.addSignal(employeeId, signal);

    console.log(`👁️  [SIGNAL] browser_hidden - Employee ${employeeId}: ${signal.meaning}`);
    this.emit('signal-captured', { employeeId, signal });
  }

  /**
   * Add signal to employee's signal buffer
   */
  addSignal(employeeId, signal) {
    const employee = this.employeeSignals.get(employeeId);
    if (!employee) return;

    employee.signals.push(signal);

    // Keep only last N signals
    if (employee.signals.length > this.config.signalBufferSize) {
      employee.signals.shift();
    }
  }

  /**
   * Helper: Calculate mouse velocity
   */
  calculateMouseVelocity(mouseBuffer) {
    if (mouseBuffer.length < 2) return 0;

    const recent = mouseBuffer.slice(-10);
    let totalDistance = 0;

    for (let i = 1; i < recent.length; i++) {
      const dx = recent[i].x - recent[i-1].x;
      const dy = recent[i].y - recent[i-1].y;
      totalDistance += Math.sqrt(dx*dx + dy*dy);
    }

    return totalDistance / recent.length;
  }

  /**
   * Helper: Check if tab is work-related
   */
  isWorkRelatedTab(url = '', title = '') {
    const workDomains = [
      'main-workflow.vercel.app',
      'github.com',
      'stackoverflow.com',
      'localhost',
      'docs.google.com',
      'notion.so',
      'figma.com',
      'slack.com',
      'teams.microsoft.com'
    ];

    const nonWorkDomains = [
      'facebook.com',
      'twitter.com',
      'instagram.com',
      'youtube.com',
      'netflix.com',
      'reddit.com',
      'tiktok.com'
    ];

    const urlLower = url.toLowerCase();

    // Check if it's a non-work domain
    if (nonWorkDomains.some(domain => urlLower.includes(domain))) {
      return false;
    }

    // Check if it's a work domain
    if (workDomains.some(domain => urlLower.includes(domain))) {
      return true;
    }

    // Default: consider it work-related if not in banned list
    return true;
  }

  /**
   * Helper: Check if app is work-related
   */
  isWorkRelatedApp(appName = '') {
    const workApps = [
      'chrome', 'firefox', 'edge', 'safari',
      'code', 'vscode', 'visual studio',
      'terminal', 'iterm',
      'slack', 'teams', 'zoom',
      'postman', 'insomnia'
    ];

    const nonWorkApps = [
      'spotify', 'itunes', 'music',
      'steam', 'epic games',
      'messenger', 'whatsapp'
    ];

    const appLower = appName.toLowerCase();

    if (nonWorkApps.some(app => appLower.includes(app))) {
      return false;
    }

    if (workApps.some(app => appLower.includes(app))) {
      return true;
    }

    return true; // Default to work-related
  }

  /**
   * Get current signal state for employee
   */
  getSignalState(employeeId) {
    const employee = this.employeeSignals.get(employeeId);
    if (!employee) return null;

    return {
      employeeId,
      sessionId: employee.sessionId,
      currentState: employee.currentState,
      lastSignals: employee.signals.slice(-10),
      statistics: this.calculateSignalStatistics(employeeId)
    };
  }

  /**
   * Calculate signal statistics
   */
  calculateSignalStatistics(employeeId) {
    const employee = this.employeeSignals.get(employeeId);
    if (!employee) return null;

    const signals = employee.signals;
    const now = Date.now();
    const lastMinute = signals.filter(s => now - s.timestamp < 60000);

    return {
      totalSignals: signals.length,
      signalsLastMinute: lastMinute.length,
      activityScore: this.calculateActivityScore(employee),
      productivityIndicator: this.calculateProductivityIndicator(employee),
      riskLevel: this.calculateRiskLevel(employee)
    };
  }

  /**
   * Calculate overall activity score (0-100)
   */
  calculateActivityScore(employee) {
    const weights = {
      keystroke: 0.3,
      mouse: 0.2,
      scroll: 0.1,
      focus: 0.2,
      taskTab: 0.2
    };

    let score = 0;

    // Keystroke score
    const keystrokeScore = Math.min(100, (employee.currentState.keystroke_rate / this.config.keystrokeThreshold) * 100);
    score += keystrokeScore * weights.keystroke;

    // Mouse score
    const mouseScore = Math.min(100, (employee.currentState.mouse_movement / this.config.mouseMovementThreshold) * 100);
    score += mouseScore * weights.mouse;

    // Scroll score
    const scrollScore = employee.currentState.scroll_depth > 0 ? 50 : 0;
    score += scrollScore * weights.scroll;

    // Focus score
    const focusScore = employee.currentState.window_focus ? 100 : 0;
    score += focusScore * weights.focus;

    // Task tab score
    const taskScore = employee.currentState.task_tab_active ? 100 : 0;
    score += taskScore * weights.taskTab;

    return Math.round(score);
  }

  /**
   * Calculate productivity indicator
   */
  calculateProductivityIndicator(employee) {
    const activityScore = this.calculateActivityScore(employee);
    const isIdle = employee.currentState.idle_time >= this.config.idleThreshold;
    const isFocused = employee.currentState.window_focus;
    const isOnTask = employee.currentState.task_tab_active;

    if (isIdle) return 'idle';
    if (!isFocused) return 'distracted';
    if (!isOnTask) return 'off-task';
    if (activityScore >= 70) return 'highly-productive';
    if (activityScore >= 40) return 'productive';
    return 'low-productivity';
  }

  /**
   * Calculate risk level
   */
  calculateRiskLevel(employee) {
    let riskScore = 0;

    // Switching out of the Infiverse web tab to work in an IDE/editor/browser is normal work,
    // not a productivity drop. Score risk on actual sustained idle or heavy context thrashing.
    if (employee.currentState.idle_time >= this.config.idleThreshold) riskScore += 35;
    if (employee.currentState.idle_time >= this.config.idleThreshold * 2.5) riskScore += 35;
    if (employee.currentState.app_switch_count > 15) riskScore += 25;

    if (riskScore >= 70) return 'high';
    if (riskScore >= 40) return 'medium';
    return 'low';
  }

  /**
   * Flush current signal state to MongoDB for all tracked employees
   */
  async flushToMongo() {
    const now = Date.now();
    for (const [employeeId, employee] of this.employeeSignals) {
      try {
        const lastActivity = Math.max(
          employee.realtime.lastKeystroke || 0,
          employee.realtime.lastMouseMove || 0,
          employee.realtime.lastScrollEvent || 0,
          employee.realtime.lastFocusChange || 0
        );

        // If inactive for > 2 hours, stop tracking to prevent memory and DB bloat
        if (now - lastActivity > 2 * 60 * 60 * 1000) {
          this.employeeSignals.delete(employeeId);
          continue;
        }

        const intervalKeystrokes = employee.realtime.intervalKeystrokes || 0;
        const intervalMouseEvents = employee.realtime.intervalMouseEvents || 0;

        // Reset interval counters immediately for the next 30-second window
        employee.realtime.intervalKeystrokes = 0;
        employee.realtime.intervalMouseEvents = 0;

        // Skip writing empty 30s browser background rows after 3m of browser inactivity or while tab is unfocused.
        // Prevents background dashboard tabs from spamming Desktop Workspace 0-score idle samples.
        if (intervalKeystrokes === 0 && intervalMouseEvents === 0) {
          if (now - lastActivity > 3 * 60 * 1000 || !employee.currentState.window_focus) {
            continue;
          }
        }

        // Calculate accurate mouse activity score (0-100%) for this 30s window:
        // A baseline of 20 mouse movement/click events in 30 seconds = 100% active mouse engagement.
        const timeSinceMouse = now - (employee.realtime.lastMouseMove || 0);
        let intervalMouseScore = 0;
        if (timeSinceMouse < 30000 && intervalMouseEvents > 0) {
          intervalMouseScore = Math.min(100, Math.round((intervalMouseEvents / 20) * 100));
        }

        // Idle duration for this 30s interval:
        // If user had no keystrokes and no mouse activity in this 30s, record idle seconds
        const timeSinceActivity = now - lastActivity;
        let intervalIdleSec = 0;
        if (intervalKeystrokes === 0 && intervalMouseScore < 10) {
          intervalIdleSec = Math.min(30, Math.max(0, Math.floor(timeSinceActivity / 1000)));
        }

        const stats = this.calculateSignalStatistics(employeeId);
        const activityScore = stats.activityScore;
        const riskLevel = stats.riskLevel;
        const indicator = stats.productivityIndicator;

        // 1. Persist snapshot to EmployeeActivity with real interval metrics.
        // Raw mouse_event_count/mouse_cadence must be written here too: TRINETRA
        // live telemetry sums mouse_event_count (falling back to 0 when absent),
        // so rows built only from the score showed keystrokes with zero mouse.
        const intervalSeconds = 30;
        const activityDoc = new EmployeeActivity({
          employee: employeeId,
          session_id: employee.sessionId || 'unknown',
          keystroke_count: intervalKeystrokes,
          mouse_activity_score: intervalMouseScore,
          mouse_event_count: intervalMouseEvents,
          mouse_cadence: Math.round((intervalMouseEvents / intervalSeconds) * 60),
          keystroke_cadence: Math.round((intervalKeystrokes / intervalSeconds) * 60),
          interval_seconds: intervalSeconds,
          idle_duration: intervalIdleSec,
          active_application: { url: null, name: null, title: null },
          timestamp: new Date(),
        });
        activityDoc.calculateProductivityScore();
        await activityDoc.save();

        // 2. Update WorkSession productivity rollup
        const session = await WorkSession.getTodaySession(employeeId);
        if (session) {
          await session.updateProductivity({
            keystrokeCount: (session.productivity.keystrokeCount || 0) + intervalKeystrokes,
            mouseActivity: Math.round(((session.productivity.mouseActivity || 0) + intervalMouseScore) / 2),
            idleTime: (session.productivity.idleTime || 0) + Math.floor(intervalIdleSec / 60),
          });
        }

        // 3. Fire MonitoringAlert only on sustained high risk or true idle, throttled to once per 15 mins per user
        const lastAlertAt = employee.realtime.lastAlertAt || 0;
        if ((riskLevel === 'high' || indicator === 'idle') && now - lastAlertAt >= 15 * 60 * 1000) {
          employee.realtime.lastAlertAt = now;
          const alertType = indicator === 'idle' ? 'idle_timeout' : 'productivity_drop';
          const severity = riskLevel === 'high' ? 'high' : 'medium';
          await MonitoringAlert.createAlert({
            employee: employeeId,
            alert_type: alertType,
            severity,
            title: indicator === 'idle' ? 'Employee Idle Detected' : 'Productivity Drop Detected',
            description: `Employee ${employeeId} — indicator: ${indicator}, risk: ${riskLevel}, score: ${activityScore}`,
            session_id: employee.sessionId,
            data: { productivity_score: activityScore, activity_data: employee.currentState },
          });
        }
      } catch (err) {
        console.error(`[EMS] flushToMongo failed for ${employeeId}:`, err.message);
      }
    }
  }

  /**
   * Start signal processor
   */
  startSignalProcessor() {
    // Check idle time + flush to MongoDB every 30 seconds
    setInterval(() => {
      for (const [employeeId] of this.employeeSignals) {
        this.captureIdleTime(employeeId);
      }
      this.flushToMongo();
    }, 30000);

    console.log('⚙️  [EMS] Signal processor started');
  }

  /**
   * Get all signals for employee in time range
   */
  getSignals(employeeId, startTime, endTime) {
    const employee = this.employeeSignals.get(employeeId);
    if (!employee) return [];

    return employee.signals.filter(signal => {
      return signal.timestamp >= startTime && signal.timestamp <= endTime;
    });
  }

  /**
   * Clear employee signals
   */
  clearEmployeeSignals(employeeId) {
    const employee = this.employeeSignals.get(employeeId);
    if (employee) {
      employee.signals = [];
      console.log(`🗑️  [EMS] Cleared signals for employee ${employeeId}`);
    }
  }

  /**
   * Stop tracking employee
   */
  stopTracking(employeeId) {
    this.employeeSignals.delete(employeeId);
    console.log(`🛑 [EMS] Stopped tracking employee ${employeeId}`);
  }

  /**
   * Get live capture proof (for console demonstration)
   */
  getLiveCaptureProof(employeeId) {
    const employee = this.employeeSignals.get(employeeId);
    if (!employee) return null;

    const proof = {
      timestamp: new Date().toISOString(),
      employeeId,
      sessionId: employee.sessionId,
      signals_captured: employee.signals.length,
      current_state: employee.currentState,
      last_5_signals: employee.signals.slice(-5),
      statistics: this.calculateSignalStatistics(employeeId),
      live_status: '✅ CAPTURING'
    };

    console.log('\n' + '='.repeat(80));
    console.log('📊 LIVE CAPTURE PROOF - EMS Signal Layer');
    console.log('='.repeat(80));
    console.log(JSON.stringify(proof, null, 2));
    console.log('='.repeat(80) + '\n');

    return proof;
  }
}

// Export singleton instance
module.exports = new EMSSignalLayer();
