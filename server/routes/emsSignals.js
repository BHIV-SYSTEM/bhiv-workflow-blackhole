const express = require('express');
const router = express.Router();
const emsSignals = require('../services/ems_signals');
const auth = require('../middleware/auth');
const {
  signalExcessiveIdle,
  signalKeystrokeAnomaly,
  signalNormalActivity,
} = require('../services/karmaClient');
const pranaClient = require('../services/pranaClient');

// Throttle normal activity signals to avoid hammering Bucket VM and Karma chain (TTL is 300s)
const normalActivityLastSent = new Map();
const NORMAL_ACTIVITY_THROTTLE_MS = 60 * 1000;

function throttledSignalNormalActivity(empId) {
  const empKey = String(empId);
  const now = Date.now();
  const last = normalActivityLastSent.get(empKey) || 0;
  if (now - last < NORMAL_ACTIVITY_THROTTLE_MS) {
    return;
  }
  normalActivityLastSent.set(empKey, now);
  signalNormalActivity(empKey).catch(() => {});
}

/**
 * EMS Signal API Routes
 * Endpoints for receiving and managing real-time employee activity signals
 */

// Initialize employee signal tracking
router.post('/signals/init', async (req, res) => {
  try {
    const { employeeId, sessionId } = req.body;

    if (!employeeId || !sessionId) {
      return res.status(400).json({ 
        error: 'employeeId and sessionId are required' 
      });
    }

    emsSignals.initializeEmployee(employeeId, sessionId);

    res.json({
      success: true,
      message: 'Signal tracking initialized',
      employeeId,
      sessionId,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error initializing signal tracking:', error);
    res.status(500).json({ error: 'Failed to initialize signal tracking' });
  }
});

// Receive batch signals from client
router.post('/signals', async (req, res) => {
  try {
    let { employeeId, sessionId, signals } = req.body;

    // Accept PRANA packet format: { user_id, raw_signals, cognitive_state, focus_score, ... }
    if (!employeeId && req.body.user_id) {
      employeeId = req.body.user_id;
      sessionId = req.body.session_id;
      const raw = req.body.raw_signals || {};
      signals = [
        { type: 'window_focus',      value: raw.window_focus,    metadata: { cognitive_state: req.body.cognitive_state, focus_score: req.body.focus_score } },
        { type: 'keystroke_rate',    value: raw.keystroke_count, metadata: { count: raw.keystroke_count, rate: raw.keystroke_count } },
        { type: 'mouse_movement',    value: raw.mouse_events,    metadata: { events: raw.mouse_events, distance: raw.mouse_distance, velocity: raw.mouse_velocity } },
        { type: 'scroll_depth',      value: raw.scroll_depth,    metadata: { depth: raw.scroll_depth, events: raw.scroll_events } },
        { type: 'task_tab_active',   value: raw.task_tab_active, metadata: { active: raw.task_tab_active } },
        { type: 'app_switch',        value: raw.app_switches,    metadata: { count: raw.app_switches } },
        { type: 'browser_hidden',    value: raw.browser_hidden,  metadata: { hidden: raw.browser_hidden } },
        { type: 'productivity_score',value: req.body.focus_score, metadata: { focus_score: req.body.focus_score, cognitive_state: req.body.cognitive_state, active_seconds: req.body.active_seconds, idle_seconds: req.body.idle_seconds } },
      ].filter(s => s.value !== undefined && s.value !== null);
    }

    if (!employeeId || !signals || !Array.isArray(signals)) {
      return res.status(400).json({ 
        error: 'employeeId and signals array are required' 
      });
    }

    const types = [...new Set(signals.map((s) => s?.type).filter(Boolean))];

    // Process each signal
    let processed = 0;
    for (const signal of signals) {
      try {
        switch (signal.type) {
          case 'window_focus':
            emsSignals.captureWindowFocus(employeeId, signal.value, signal.metadata);
            break;
          
          case 'keystroke':
          case 'keystroke_rate':
            emsSignals.captureKeystroke(employeeId, {
              ...signal.metadata,
              count: signal.metadata?.count || signal.metadata?.keystroke_count || (typeof signal.value === 'number' && signal.value > 0 ? signal.value : 1)
            });
            break;
          
          case 'mouse_movement':
            emsSignals.captureMouseMovement(employeeId, {
              ...signal.metadata,
              count: signal.metadata?.events || signal.metadata?.mouse_events || signal.metadata?.count || (typeof signal.value === 'number' && signal.value > 0 ? signal.value : 1)
            });
            break;
          
          case 'scroll_depth':
            emsSignals.captureScrollDepth(employeeId, signal.metadata);
            break;
          
          case 'task_tab_active':
            emsSignals.captureTaskTabActive(employeeId, signal.metadata);
            break;
          
          case 'app_switch':
            emsSignals.captureAppSwitch(employeeId, signal.metadata);
            break;
          
          case 'browser_hidden':
            emsSignals.captureBrowserHidden(employeeId, signal.value, signal.metadata);
            break;

          case 'focus_change':
            // cognitive state change — store as window_focus signal
            emsSignals.captureWindowFocus(employeeId, signal.value !== 'AWAY' && signal.value !== 'IDLE', signal.metadata);
            break;

          case 'idle_time':
            // idle detection — reuse window_focus with inverted value
            emsSignals.captureWindowFocus(employeeId, (signal.value || 0) < 120, signal.metadata);
            break;

          case 'productivity_score':
          case 'session_heartbeat':
          case 'session_end':
            // stored in signal buffer as-is via addSignal
            emsSignals.initializeEmployee(employeeId, sessionId || signal.metadata && signal.metadata.sessionId || 'unknown');
            break;
          
          default:
            console.warn(`Unknown signal type: ${signal.type}`);
        }
        processed++;
      } catch (err) {
        console.error(`Error processing signal ${signal.type}:`, err);
      }
    }

    // Get current state
    const currentState = emsSignals.getSignalState(employeeId);

    // KARMA normal activity signal (zero automated penalties under V2 privacy boundaries)
    throttledSignalNormalActivity(String(employeeId));

    // PRANA Telemetry Propagation (asynchronous / non-blocking)
    const traceId = req.headers['x-trace-id'] || req.headers['x-request-id'];
    const traceparent = req.headers['traceparent'];
    const tracestate = req.headers['tracestate'];

    pranaClient.sendTelemetry(
      {
        user_id: String(employeeId),
        session_id: String(sessionId || 'ems-session'),
        focus_score: currentState?.statistics?.productivityScore ?? 85,
        cognitive_state: currentState?.currentState || 'ACTIVE',
        raw_signals: req.body.raw_signals || {
          signals_count: signals.length,
          processed_count: processed,
          types: types,
        },
        timestamp: new Date().toISOString(),
      },
      {
        traceId,
        traceparent,
        tracestate,
      }
    ).catch((err) => {
      console.warn(`[EMS->PRANA] Non-blocking telemetry forward failed: ${err.message}`);
    });

    res.json({
      success: true,
      received: signals.length,
      processed: processed,
      employeeId,
      currentState: currentState?.currentState,
      statistics: currentState?.statistics,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Error processing signals:', error);
    res.status(500).json({ error: 'Failed to process signals' });
  }
});

// Receive individual signal (real-time)
router.post('/signals/realtime', async (req, res) => {
  try {
    const { employeeId, type, value, metadata } = req.body;

    if (!employeeId || !type) {
      return res.status(400).json({ 
        error: 'employeeId and type are required' 
      });
    }

    // Process signal immediately
    switch (type) {
      case 'window_focus':
        emsSignals.captureWindowFocus(employeeId, value, metadata);
        break;
      
      case 'keystroke':
        emsSignals.captureKeystroke(employeeId, metadata);
        break;
      
      case 'mouse_movement':
        emsSignals.captureMouseMovement(employeeId, metadata);
        break;
      
      case 'scroll_depth':
        emsSignals.captureScrollDepth(employeeId, metadata);
        break;
      
      case 'task_tab_active':
        emsSignals.captureTaskTabActive(employeeId, metadata);
        break;
      
      case 'app_switch':
        emsSignals.captureAppSwitch(employeeId, metadata);
        break;
      
      case 'browser_hidden':
        emsSignals.captureBrowserHidden(employeeId, value, metadata);
        break;
      
      default:
        return res.status(400).json({ error: `Unknown signal type: ${type}` });
    }

    res.json({
      success: true,
      type,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Error processing real-time signal:', error);
    res.status(500).json({ error: 'Failed to process signal' });
  }
});

// Get signal state for employee
router.get('/signals/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    const state = emsSignals.getSignalState(employeeId);
    
    if (!state) {
      return res.status(404).json({ 
        error: 'Employee not found or not being tracked' 
      });
    }

    res.json(state);
  } catch (error) {
    console.error('Error fetching signal state:', error);
    res.status(500).json({ error: 'Failed to fetch signal state' });
  }
});

// Get signals in time range
router.get('/signals/:employeeId/history', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startTime, endTime } = req.query;

    const start = startTime ? parseInt(startTime) : Date.now() - 3600000; // Last hour
    const end = endTime ? parseInt(endTime) : Date.now();

    const signals = emsSignals.getSignals(employeeId, start, end);

    res.json({
      employeeId,
      timeRange: { startTime: start, endTime: end },
      signals,
      count: signals.length
    });
  } catch (error) {
    console.error('Error fetching signal history:', error);
    res.status(500).json({ error: 'Failed to fetch signal history' });
  }
});

// Get live capture proof (for testing)
router.get('/signals/:employeeId/proof', async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    const proof = emsSignals.getLiveCaptureProof(employeeId);
    
    if (!proof) {
      return res.status(404).json({ 
        error: 'Employee not found or not being tracked' 
      });
    }

    res.json(proof);
  } catch (error) {
    console.error('Error generating proof:', error);
    res.status(500).json({ error: 'Failed to generate proof' });
  }
});

// Stop tracking employee
router.post('/signals/:employeeId/stop', async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    emsSignals.stopTracking(employeeId);

    res.json({
      success: true,
      message: 'Signal tracking stopped',
      employeeId,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error stopping tracking:', error);
    res.status(500).json({ error: 'Failed to stop tracking' });
  }
});

// Clear employee signals
router.delete('/signals/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    emsSignals.clearEmployeeSignals(employeeId);

    res.json({
      success: true,
      message: 'Signals cleared',
      employeeId,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error clearing signals:', error);
    res.status(500).json({ error: 'Failed to clear signals' });
  }
});

// GET /api/ems-signals/timeline/:employeeId?date=YYYY-MM-DD
router.get('/timeline/:employeeId', auth, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const state = emsSignals.getSignalState(employeeId);
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const daySignals = emsSignals.getSignals(
      employeeId,
      startOfDay.getTime(),
      endOfDay.getTime()
    );

    const workingTimeline = {};
    const productivityTimeline = {};

    for (const sig of daySignals) {
      const hour = new Date(sig.timestamp).getHours();
      const key = `${String(hour).padStart(2, '0')}:00`;

      if (!workingTimeline[key]) workingTimeline[key] = { active_signals: 0, idle_signals: 0 };
      if (!productivityTimeline[key]) productivityTimeline[key] = { scores: [], avg_score: 0 };

      if (sig.type === 'idle_time' && (sig.value || 0) > 120) {
        workingTimeline[key].idle_signals++;
      } else if (['keystroke', 'mouse_movement', 'window_focus', 'task_tab_active'].includes(sig.type)) {
        workingTimeline[key].active_signals++;
      }

      if (sig.type === 'productivity_score' && sig.metadata && sig.metadata.focus_score != null) {
        productivityTimeline[key].scores.push(sig.metadata.focus_score);
      }
    }

    for (const key of Object.keys(productivityTimeline)) {
      const scores = productivityTimeline[key].scores;
      productivityTimeline[key].avg_score = scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;
      delete productivityTimeline[key].scores;
    }

    res.json({
      employeeId,
      date,
      currentState: state ? state.currentState : null,
      statistics: state ? state.statistics : null,
      workingTimeline,
      productivityTimeline,
      totalSignals: daySignals.length,
    });
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

module.exports = router;
