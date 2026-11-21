/**
 * keystroke-text-capture.js
 * DEPRECATED & EXCISED under Niyantran Employee Monitoring V2 Privacy Boundaries.
 * Keylogging and typed text capture have been permanently eradicated.
 */

class KeystrokeTextCapture {
  constructor() {
    this.pending = [];
  }

  onKeydown() {
    // Zero text capture
  }

  reset() {
    this.pending = [];
  }

  hasPending() {
    return false;
  }

  drain() {
    return [];
  }

  requeue() {}
}

export default KeystrokeTextCapture;
