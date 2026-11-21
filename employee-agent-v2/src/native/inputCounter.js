/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Native Input Counter Contract (Phase A Scaffolding)
 *
 * PRIVACY GUARANTEE:
 * This module counts event frequencies ONLY.
 * It NEVER logs scancodes, characters, words, sentences, or clipboards.
 * In Phase A, no native OS hooks are loaded.
 */

export class NativeInputCounterContract {
  constructor() {
    this.keyPressCount = 0;
    this.mouseClickCount = 0;
    this.mouseScrollDelta = 0;
    this.mouseDistance = 0;
    this.lastInputTime = Date.now();
  }

  /**
   * Increments keystroke counter without inspecting key identity.
   */
  recordKeyPress() {
    this.keyPressCount += 1;
    this.lastInputTime = Date.now();
  }

  /**
   * Increments mouse click counter without recording coordinate context.
   */
  recordMouseClick() {
    this.mouseClickCount += 1;
    this.lastInputTime = Date.now();
  }

  /**
   * Returns current window aggregates and resets counters for the next window.
   */
  flushWindowMetrics(windowDurationSeconds = 60) {
    const metrics = {
      keyPresses: this.keyPressCount,
      mouseClicks: this.mouseClickCount,
      mouseScrollDelta: this.mouseScrollDelta,
      mouseDistance: Math.round(this.mouseDistance),
      durationSeconds: windowDurationSeconds,
      timestamp: new Date().toISOString(),
    };

    // Reset counters for next bucket
    this.keyPressCount = 0;
    this.mouseClickCount = 0;
    this.mouseScrollDelta = 0;
    this.mouseDistance = 0;

    return metrics;
  }
}

export default NativeInputCounterContract;
