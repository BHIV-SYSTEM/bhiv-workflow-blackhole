/**
 * Keystroke Text Capture - reconstructs what the employee actually types.
 *
 * uIOhook only reports keycodes (no characters), so this module maps
 * keycodes → characters for the US layout, maintains a live segment
 * buffer with inter-key intervals, and hands finished segments to the
 * activity tracker for upload to POST /api/agent/keystroke/ingest.
 *
 * Design notes:
 *  - Segments end on Enter, after a 5s typing pause, at 1000 chars, or
 *    when drained by the tracker (every telemetry tick / on stop).
 *  - Ctrl/Meta combinations never insert text; Ctrl+V is counted as a
 *    paste event so the server can flag paste-heavy "writing".
 *  - Text is NOT captured while the foreground window looks like a
 *    password/login/OTP screen (keys are still counted for activity).
 */

// US layout: uiohook keycode → base character (no modifiers).
const CHAR_MAP = {
  30: 'a', 48: 'b', 46: 'c', 32: 'd', 18: 'e', 33: 'f', 34: 'g', 35: 'h',
  23: 'i', 36: 'j', 37: 'k', 38: 'l', 50: 'm', 49: 'n', 24: 'o', 25: 'p',
  16: 'q', 19: 'r', 31: 's', 20: 't', 22: 'u', 47: 'v', 17: 'w', 45: 'x',
  21: 'y', 44: 'z',
  11: '0', 2: '1', 3: '2', 4: '3', 5: '4', 6: '5', 7: '6', 8: '7', 9: '8', 10: '9',
  57: ' ',
  39: ';', 51: ',', 12: '-', 52: '.', 53: '/', 41: '`',
  26: '[', 43: '\\', 27: ']', 40: "'", 13: '=',
  // Numpad
  82: '0', 79: '1', 80: '2', 81: '3', 75: '4', 76: '5', 77: '6',
  71: '7', 72: '8', 73: '9', 83: '.'
};

// Shifted characters for non-letter keys.
const SHIFT_CHAR = {
  11: ')', 2: '!', 3: '@', 4: '#', 5: '$', 6: '%', 7: '^', 8: '&', 9: '*', 10: '(',
  39: ':', 51: '<', 12: '_', 52: '>', 53: '?', 41: '~',
  26: '{', 43: '|', 27: '}', 40: '"', 13: '+'
};

const KEY = {
  Backspace: 14,
  Tab: 15,
  Enter: 28,
  CapsLock: 58,
  Escape: 1,
  V: 47
};

const SEGMENT_MAX_CHARS = 1000;
const SEGMENT_PAUSE_MS = 5000;
const MAX_INTERVALS = 500;
const MAX_PENDING_SEGMENTS = 50;

// Foreground windows where typed text must not be reconstructed.
const SENSITIVE_WINDOW_PATTERN =
  /password|passwd|passcode|credential|login|sign[\s-]?in|log[\s-]?on|otp|one[\s-]?time|secure\s*key|private\s*key/i;

// Pure letter keycodes (A-Z scan codes only; punctuation excluded so
// shift maps still apply to keys like ';' and quotes).
const LETTER_KEYCODES = new Set([
  30, 48, 46, 32, 18, 33, 34, 35, 23, 36, 37, 38, 50, 49,
  24, 25, 16, 19, 31, 20, 22, 47, 17, 45, 21, 44
]);

function isLetterKey(keycode) {
  return LETTER_KEYCODES.has(keycode);
}

class KeystrokeCapture {
  constructor() {
    this.pending = [];
    this.segment = null;
    this.capsLock = false;
    this.lastPrintableAt = 0;
  }

  reset() {
    this.pending = [];
    this.segment = null;
    this.capsLock = false;
    this.lastPrintableAt = 0;
  }

  newSegment(now) {
    return {
      text: '',
      keyCount: 0,
      backspaceCount: 0,
      pasteCount: 0,
      intervals: [],
      start: now,
      lastAt: now
    };
  }

  isSensitiveContext(context) {
    if (!context) return false;
    const haystack = `${context.activeApp || ''} ${context.activeAppTitle || ''}`;
    return SENSITIVE_WINDOW_PATTERN.test(haystack);
  }

  pushSegment(segment, now) {
    if (!segment) return;
    const meaningful = segment.text.trim().length > 0 || segment.keyCount > 0;
    if (!meaningful) return;
    segment.durationMs = Math.max(0, (segment.lastAt || now) - segment.start);
    this.pending.push(segment);
    if (this.pending.length > MAX_PENDING_SEGMENTS) {
      this.pending.shift();
    }
  }

  finishSegment(now) {
    if (!this.segment) return;
    this.pushSegment(this.segment, now);
    this.segment = null;
  }

  /**
   * Feed one uIOhook keydown event.
   * @param {Object} event - UiohookKeyboardEvent
   * @param {Object} context - { activeApp, activeAppTitle } at event time
   */
  onKeyDown(event, context) {
    if (!event || typeof event.keycode !== 'number') return;

    const now = Date.now();
    const keycode = event.keycode;

    if (keycode === KEY.CapsLock) {
      this.capsLock = !this.capsLock;
      return;
    }

    // Shortcuts: never reconstruct text. Ctrl+V counts as a paste event.
    if (event.ctrlKey || event.metaKey) {
      if (event.ctrlKey && keycode === KEY.V) {
        if (!this.segment) this.segment = this.newSegment(now);
        this.segment.pasteCount += 1;
        this.segment.lastAt = now;
      }
      return;
    }
    if (event.altKey) return;

    // Typing pause ⇒ previous text is its own segment.
    if (this.segment && now - this.segment.lastAt > SEGMENT_PAUSE_MS) {
      this.finishSegment(this.segment.lastAt);
    }
    if (!this.segment) {
      this.segment = this.newSegment(now);
    }

    const seg = this.segment;
    const sensitive = this.isSensitiveContext(context);

    if (keycode === KEY.Backspace) {
      seg.backspaceCount += 1;
      if (!sensitive && seg.text.length > 0) {
        seg.text = seg.text.slice(0, -1);
      }
      seg.lastAt = now;
      return;
    }

    if (keycode === KEY.Enter) {
      if (!sensitive) seg.text += '\n';
      seg.keyCount += 1;
      seg.lastAt = now;
      this.finishSegment(now);
      return;
    }

    if (keycode === KEY.Tab || keycode === KEY.Escape) {
      seg.lastAt = now;
      return;
    }

    // Resolve the printable character for this key.
    let ch = null;
    if (isLetterKey(keycode)) {
      ch = CHAR_MAP[keycode];
      const upper = event.shiftKey !== this.capsLock; // XOR
      if (upper) ch = ch.toUpperCase();
    } else if (CHAR_MAP[keycode] !== undefined) {
      ch = event.shiftKey
        ? (SHIFT_CHAR[keycode] || CHAR_MAP[keycode])
        : CHAR_MAP[keycode];
    }

    if (ch === null) {
      seg.lastAt = now;
      return;
    }

    seg.keyCount += 1;
    seg.lastAt = now;

    // Inter-key rhythm only for printable keys (mashing detection signal).
    if (this.lastPrintableAt && now - this.lastPrintableAt <= SEGMENT_PAUSE_MS) {
      seg.intervals.push(now - this.lastPrintableAt);
      if (seg.intervals.length > MAX_INTERVALS) {
        seg.intervals.splice(0, seg.intervals.length - MAX_INTERVALS);
      }
    }
    this.lastPrintableAt = now;

    if (sensitive) return; // count the key, never the content

    seg.text += ch;
    if (seg.text.length >= SEGMENT_MAX_CHARS) {
      this.finishSegment(now);
    }
  }

  /**
   * Return all finished segments (plus the live one) and clear the buffer.
   * @returns {Array<Object>}
   */
  drain() {
    this.finishSegment(Date.now());
    const segments = this.pending;
    this.pending = [];
    this.lastPrintableAt = 0;
    return segments;
  }

  /**
   * Put segments back (upload failed with a retryable error).
   * @param {Array<Object>} segments
   */
  requeue(segments) {
    if (!Array.isArray(segments) || segments.length === 0) return;
    this.pending = [...segments, ...this.pending].slice(0, MAX_PENDING_SEGMENTS);
  }
}

module.exports = KeystrokeCapture;
