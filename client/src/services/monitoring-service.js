/**
 * monitoring-service.js
 * Automatic employee monitoring — starts on login, stops on logout.
 * Covers all 10 required metrics:
 *   1. Active application usage   (task_tab_active + app_switches)
 *   2. Website activity           (URL / domain tracking)
 *   3. Active window tracking     (window_focus + panel_focused)
 *   4. Keyboard activity          (keystroke_count)
 *   5. Mouse activity             (mouse_events, mouse_distance, mouse_velocity)
 *   6. Session duration           (login → logout wall-clock)
 *   7. Idle detection             (idle_seconds, inactivity_ms)
 *   8. Focus changes              (cognitive_state transitions)
 *   9. Working timeline           (persisted via /api/ems-signals/timeline)
 *  10. Productivity timeline      (focus_score per 5-s window, persisted)
 */

const FLUSH_INTERVAL_MS = 10_000; // send batch every 10 s
const HEARTBEAT_INTERVAL_MS = 30_000; // session heartbeat every 30 s
const TRINETRA_INTERVAL_MS = 5_000; // live browser sample → /agent/activity/ingest

class MonitoringService {
  constructor() {
    this._employeeId = null;
    this._sessionId = null;
    this._sessionStart = null;
    this._apiBase = null;
    this._token = null;

    this._signalBuffer = [];
    this._flushTimer = null;
    this._heartbeatTimer = null;
    this._pranaUnsubscribe = null;

    // Active window / URL tracking
    this._lastUrl = null;
    this._lastTitle = null;
    this._urlObserver = null;

    // Bound handlers (so we can remove them)
    this._onFocus = () => this._pushSignal('window_focus', true, { panel_focused: true });
    this._onBlur = () => this._pushSignal('window_focus', false, { panel_focused: false, app_switch: true });
    this._onVisibility = () => {
      const hidden = document.hidden;
      this._pushSignal('browser_hidden', hidden, { visibilityState: document.visibilityState });
    };
    this._onBeforeUnload = () => this._flush(true);

    // TRINETRA feed — browser input counters → /agent/activity/ingest
    this._trinetraTimer = null;
    this._tKeys = 0;
    this._tMouse = 0;
    this._tMouseCountedAt = 0;
    this._tLastInputAt = Date.now();
    this._tAttendanceId = null;
    this._tFeedEnabled = true;
    this._tBackoffUntil = 0;
    this._onCountKey = () => {
      this._tKeys += 1;
      this._tLastInputAt = Date.now();
    };
    this._onCountMove = () => {
      const now = Date.now();
      this._tLastInputAt = now;
      // Throttle to 10 moves/s (600/min ceiling) so the server-side mouse
      // score scales identically to the desktop agent's event stream.
      if (now - this._tMouseCountedAt >= 100) {
        this._tMouseCountedAt = now;
        this._tMouse += 1;
      }
    };
    this._onCountMouseAction = () => {
      this._tMouse += 1;
      this._tLastInputAt = Date.now();
    };
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  start(user, token, apiBase) {
    if (this._employeeId) return; // already running

    this._employeeId = user.id;
    this._sessionId = `ms_${user.id}_${Date.now()}`;
    this._sessionStart = Date.now();
    this._token = token;
    this._apiBase = apiBase;
    this._prevKeystrokes = 0;
    this._prevMouseEvents = 0;
    if (typeof window !== 'undefined') {
      window.__monitoringServiceActive = true;
    }

    this._tKeys = 0;
    this._tMouse = 0;
    this._tLastInputAt = Date.now();
    this._tAttendanceId = null;
    this._tFeedEnabled = true;
    this._tBackoffUntil = 0;

    this._attachBrowserListeners();
    this._attachPranaListener();
    this._startUrlTracking();
    this._startFlushTimer();
    this._startHeartbeat();
    this._attachInputCounters();
    this._startTrinetraFeed();

    // Init session on server
    this._post('/ems-signals/signals/init', {
      employeeId: this._employeeId,
      sessionId: this._sessionId,
    }).catch(() => {});

    console.log('[Monitor] Started for', user.email, '| session:', this._sessionId);
  }

  stop() {
    if (!this._employeeId) return;

    this._flush(true);

    // Send session-end signal
    this._post('/ems-signals/signals', {
      employeeId: this._employeeId,
      sessionId: this._sessionId,
      signals: [{
        type: 'session_end',
        timestamp: Date.now(),
        metadata: {
          sessionDurationMs: Date.now() - this._sessionStart,
          sessionDurationSeconds: Math.round((Date.now() - this._sessionStart) / 1000),
        },
      }],
    }).catch(() => {});

    this._detachBrowserListeners();
    this._detachPranaListener();
    this._stopUrlTracking();
    this._detachInputCounters();
    clearInterval(this._flushTimer);
    clearInterval(this._heartbeatTimer);
    clearInterval(this._trinetraTimer);

    console.log('[Monitor] Stopped for', this._employeeId,
      '| duration:', Math.round((Date.now() - this._sessionStart) / 1000), 's');

    this._employeeId = null;
    this._sessionId = null;
    this._sessionStart = null;
    this._token = null;
    this._signalBuffer = [];
    this._prevKeystrokes = 0;
    this._prevMouseEvents = 0;
    this._tKeys = 0;
    this._tMouse = 0;
    this._tAttendanceId = null;
    this._tFeedEnabled = true;
    this._tBackoffUntil = 0;
    if (typeof window !== 'undefined') {
      window.__monitoringServiceActive = false;
    }
  }

  // ─── PRANA bridge ──────────────────────────────────────────────────────────

  _attachPranaListener() {
    // Poll PRANA signal capture every 5 s (same cadence as packet builder)
    this._pranaTimer = setInterval(() => {
      try {
        const capture = window.__pranaSignalCapture;
        if (!capture) return;
        const s = capture.getSignals();
        this._mapPranaSignals(s);
      } catch (_) {}
    }, 5000);
  }

  _detachPranaListener() {
    clearInterval(this._pranaTimer);
  }

  _mapPranaSignals(s) {
    const now = Date.now();

    // 3. Active window / focus changes
    this._pushSignal('window_focus', s.window_focus, {
      panel_focused: s.panel_focused,
      tab_visible: s.tab_visible,
      browser_visibility: s.browser_visibility,
    });

    // 4. Keyboard activity - send DELTA since last sample, avoid phantom repetitive counts
    const curKeys = s.keystroke_count || 0;
    const deltaKeys = Math.max(0, curKeys - (this._prevKeystrokes || 0));
    this._prevKeystrokes = curKeys;

    if (deltaKeys > 0) {
      this._pushSignal('keystroke', deltaKeys, {
        count: deltaKeys,
        keystroke_count: deltaKeys,
      });
    }

    // 5. Mouse activity - send DELTA since last sample
    const curMouse = s.mouse_events || 0;
    const deltaMouse = Math.max(0, curMouse - (this._prevMouseEvents || 0));
    this._prevMouseEvents = curMouse;

    if (deltaMouse > 0) {
      this._pushSignal('mouse_movement', deltaMouse, {
        count: deltaMouse,
        events: deltaMouse,
        mouse_events: deltaMouse,
        mouse_distance: Math.round(s.mouse_distance),
        mouse_velocity: s.mouse_velocity,
        content_clicks: s.content_clicks,
      });
    }

    // 7. Idle detection
    this._pushSignal('idle_time', s.idle_seconds, {
      idle_seconds: s.idle_seconds,
      inactivity_ms: s.inactivity_ms,
    });

    // 8. Focus changes (cognitive state from state engine)
    const stateEngine = window.__pranaStateEngine;
    if (stateEngine) {
      const summary = stateEngine.getStateSummary();
      this._pushSignal('focus_change', summary.current_state, {
        cognitive_state: summary.current_state,
        duration_seconds: summary.duration_seconds,
        total_transitions: summary.total_transitions,
      });
    }

    // 1 & 2. Active application + website activity
    this._pushSignal('task_tab_active', s.task_tab_active, {
      url: window.location.href,
      domain: window.location.hostname,
      title: document.title,
      app_switches: s.app_switches,
    });

    // 10. Productivity timeline — send focus_score
    if (window.__pranaPacketBuilder) {
      // focus_score is computed inside packet builder; we approximate from state
      const stateScoreMap = {
        DEEP_FOCUS: 95, ON_TASK: 75, THINKING: 65,
        DISTRACTED: 30, IDLE: 10, OFF_TASK: 5, AWAY: 0,
      };
      const state = stateEngine ? stateEngine.getCurrentState() : 'ON_TASK';
      const focusScore = stateScoreMap[state] ?? 50;
      this._pushSignal('productivity_score', focusScore, {
        focus_score: focusScore,
        cognitive_state: state,
        scroll_depth: s.scroll_depth,
        hover_loops: s.hover_loops,
        rapid_click_count: s.rapid_click_count,
      });
    }
  }

  // ─── Browser event listeners ───────────────────────────────────────────────

  _attachBrowserListeners() {
    window.addEventListener('focus', this._onFocus, { passive: true });
    window.addEventListener('blur', this._onBlur, { passive: true });
    document.addEventListener('visibilitychange', this._onVisibility, { passive: true });
    window.addEventListener('beforeunload', this._onBeforeUnload);
  }

  _detachBrowserListeners() {
    window.removeEventListener('focus', this._onFocus);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('visibilitychange', this._onVisibility);
    window.removeEventListener('beforeunload', this._onBeforeUnload);
  }

  // ─── TRINETRA feed (browser input → /agent/activity/ingest) ───────────────

  _attachInputCounters() {
    document.addEventListener('keydown', this._onCountKey, { passive: true });
    document.addEventListener('mousemove', this._onCountMove, { passive: true });
    document.addEventListener('mousedown', this._onCountMouseAction, { passive: true });
    document.addEventListener('wheel', this._onCountMouseAction, { passive: true });
  }

  _detachInputCounters() {
    document.removeEventListener('keydown', this._onCountKey);
    document.removeEventListener('mousemove', this._onCountMove);
    document.removeEventListener('mousedown', this._onCountMouseAction);
    document.removeEventListener('wheel', this._onCountMouseAction);
  }

  _startTrinetraFeed() {
    this._trinetraTimer = setInterval(() => this._sendTrinetraSample(), TRINETRA_INTERVAL_MS);
  }

  async _ensureAttendanceId() {
    if (this._tAttendanceId) return true;
    try {
      const res = await fetch(`${this._apiBase}/attendance/status`, {
        headers: this._token ? { 'x-auth-token': this._token } : {}
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.dayStarted && data.attendanceId) {
        this._tAttendanceId = data.attendanceId;
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  async _sendTrinetraSample() {
    if (!this._employeeId || !this._tFeedEnabled || Date.now() < this._tBackoffUntil) return;

    const keyboardEvents = this._tKeys;
    const mouseEvents = this._tMouse;
    this._tKeys = 0;
    this._tMouse = 0;
    const idleSeconds = Math.max(0, Math.round((Date.now() - this._tLastInputAt) / 1000));

    try {
      const hasDay = await this._ensureAttendanceId();
      if (!hasDay) return;

      const res = await this._post('/agent/activity/ingest', {
        attendanceId: this._tAttendanceId,
        timestamp: new Date().toISOString(),
        mouseEvents,
        keyboardEvents,
        idleSeconds,
        activeApp: document.title || window.location.hostname,
        activeAppTitle: document.title || window.location.href,
        intervalDuration: TRINETRA_INTERVAL_MS / 1000
      });

      if (!res.ok) {
        let body = {};
        try {
          body = await res.json();
        } catch (_) {}
        if (res.status === 403) {
          if (body.code === 'DAY_NOT_ACTIVE') {
            this._tAttendanceId = null;
            this._tBackoffUntil = Date.now() + 60_000;
          } else if (body.code === 'MONITORING_PAUSED' || body.code === 'CONSENT_DENIED') {
            this._tFeedEnabled = false;
            this._detachInputCounters();
          }
        }
      }
    } catch (_) {
      // Network failure — the next tick retries with fresh counters.
    }
  }

  // ─── URL / active window tracking ─────────────────────────────────────────

  _startUrlTracking() {
    this._lastUrl = window.location.href;
    this._lastTitle = document.title;

    // SPA navigation detection
    this._urlObserver = new MutationObserver(() => {
      const url = window.location.href;
      if (url !== this._lastUrl) {
        this._lastUrl = url;
        this._lastTitle = document.title;
        this._pushSignal('app_switch', url, {
          url,
          domain: window.location.hostname,
          title: document.title,
        });
      }
    });

    this._urlObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', () => this._pushSignal('app_switch', window.location.href, {
      url: window.location.href,
      domain: window.location.hostname,
      title: document.title,
    }));
  }

  _stopUrlTracking() {
    if (this._urlObserver) {
      this._urlObserver.disconnect();
      this._urlObserver = null;
    }
  }

  // ─── Signal buffer ─────────────────────────────────────────────────────────

  _pushSignal(type, value, metadata = {}) {
    this._signalBuffer.push({ type, value, metadata, timestamp: Date.now() });
    if (this._signalBuffer.length >= 50) this._flush();
  }

  _startFlushTimer() {
    this._flushTimer = setInterval(() => this._flush(), FLUSH_INTERVAL_MS);
  }

  _flush(sync = false) {
    if (!this._employeeId || this._signalBuffer.length === 0) return;

    const signals = this._signalBuffer.splice(0);
    const body = {
      employeeId: this._employeeId,
      sessionId: this._sessionId,
      signals,
    };

    if (sync && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
      navigator.sendBeacon(`${this._apiBase}/ems-signals/signals`, blob);
    } else {
      this._post('/ems-signals/signals', body).catch(() => {
        // Re-queue on failure (best-effort)
        this._signalBuffer.unshift(...signals);
      });
    }
  }

  // ─── Session heartbeat (6. session duration) ──────────────────────────────

  _startHeartbeat() {
    this._heartbeatTimer = setInterval(() => {
      if (!this._employeeId) return;
      this._pushSignal('session_heartbeat', Date.now() - this._sessionStart, {
        sessionDurationMs: Date.now() - this._sessionStart,
        sessionDurationSeconds: Math.round((Date.now() - this._sessionStart) / 1000),
        sessionId: this._sessionId,
      });
    }, HEARTBEAT_INTERVAL_MS);
  }

  // ─── HTTP helper ───────────────────────────────────────────────────────────

  _post(path, body) {
    return fetch(`${this._apiBase}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this._token ? { 'x-auth-token': this._token } : {}),
      },
      body: JSON.stringify(body),
    });
  }
}

// Singleton
const monitoringService = new MonitoringService();
export default monitoringService;
