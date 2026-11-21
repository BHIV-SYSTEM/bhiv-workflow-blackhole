/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Desktop Agent Lifecycle State Machine (Phase A Scaffolding)
 *
 * Implements strict state transitions, conflict prevention, and safe shutdown.
 */

import { AGENT_STATES } from './config.js';
import { AgentConflictDetector } from './conflictDetector.js';

export class AgentLifecycleManager {
  constructor(options = {}) {
    this.state = AGENT_STATES.UNINITIALIZED;
    this.conflictDetector = options.conflictDetector || AgentConflictDetector;
    this.onStateChange = options.onStateChange || (() => {});
    this.activeSessionId = null;
    this.deviceId = null;
  }

  getState() {
    return this.state;
  }

  setState(newState, details = {}) {
    const oldState = this.state;
    this.state = newState;
    this.onStateChange({ oldState, newState, details, timestamp: new Date() });
  }

  /**
   * Initializes agent lifecycle. Checks for V1 coexistence conflicts first.
   */
  async initialize() {
    this.setState(AGENT_STATES.INITIALIZING);

    // Mandatory Step: Detect if V1 is running
    const conflictResult = await this.conflictDetector.checkV1Running();
    if (conflictResult.hasConflict) {
      this.setState(AGENT_STATES.V1_AGENT_CONFLICT, {
        reason: 'Legacy V1 monitoring agent detected on workstation',
        detectedProcess: conflictResult.detectedProcess,
      });
      return {
        success: false,
        state: AGENT_STATES.V1_AGENT_CONFLICT,
        conflict: conflictResult,
      };
    }

    this.setState(AGENT_STATES.IDLE_WAITING_AUTH);
    return {
      success: true,
      state: AGENT_STATES.IDLE_WAITING_AUTH,
    };
  }

  /**
   * Starts active telemetry collection if authenticated and no conflict exists.
   */
  startMonitoring(sessionId, deviceId) {
    if (this.state === AGENT_STATES.V1_AGENT_CONFLICT) {
      throw new Error('Cannot start monitoring while V1 agent conflict is active');
    }
    if (this.state === AGENT_STATES.ACTIVE_MONITORING) {
      return; // Already active
    }

    this.activeSessionId = sessionId;
    this.deviceId = deviceId;
    this.setState(AGENT_STATES.ACTIVE_MONITORING, { sessionId, deviceId });
  }

  pauseMonitoring(reason = 'User or System Pause') {
    if (this.state !== AGENT_STATES.ACTIVE_MONITORING) return;
    this.setState(AGENT_STATES.PAUSED, { reason });
  }

  resumeMonitoring() {
    if (this.state !== AGENT_STATES.PAUSED) return;
    this.setState(AGENT_STATES.ACTIVE_MONITORING);
  }

  /**
   * Clean shutdown. Never interferes with other processes.
   */
  shutdown() {
    this.activeSessionId = null;
    this.deviceId = null;
    this.setState(AGENT_STATES.STOPPED);
  }
}

export default AgentLifecycleManager;
