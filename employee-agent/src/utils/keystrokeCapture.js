/**
 * Keystroke Text Capture - reconstructs what the employee actually types.
 *
 * uIOhook only reports keycodes (no characters), so this module maps
 * keycodes → characters for the US layout, maintains a live segment
 * buffer with inter-key intervals, and hands finished segments to the
 * activity tracker for upload to POST /api/agent/keystroke/ingest.
 *
 * Design notes:
 *  - A segment keeps accumulating until a REAL boundary: the foreground
 *    app changes, a 50s typing pause, 50s of total segment age, 1000
 *    chars, or the session ends (drain with { final: true }). Enter just
 *    appends a newline — it no longer splits — so a whole
 *    sentence/paragraph is uploaded as ONE text block instead of being
 *    chopped into parts. The pause/age caps bound worst-case keystroke
 *    → server latency to ~55s (50s cap + 5s telemetry cadence) so the
 *    admin views stay within a minute of live typing.
 *  - Regular telemetry drains are non-final: they ship finished segments
 *    only, so mid-sentence typing is never chopped at the tick boundary.
 *  - EVERY key on the keyboard is captured: printable characters (all
 *    US-layout symbols incl. shifted + numpad operators) go into `text`;
 *    every other key (Enter, Tab, Esc, Delete, arrows, F-keys, locks,
 *    modifiers, Ctrl/Meta combos like Ctrl+C/R) is counted in `keyCount`
 *    without polluting the reconstructed text. Backspace and Ctrl+V keep
 *    their dedicated counters (backspaceCount / pasteCount).
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
  // Numpad digits / decimal
  82: '0', 79: '1', 80: '2', 81: '3', 75: '4', 76: '5', 77: '6',
  71: '7', 72: '8', 73: '9', 83: '.',
  // Numpad operators
  55: '*', 78: '+', 74: '-', 3637: '/'
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
  NumpadEnter: 3612,
  CapsLock: 58,
  Escape: 1,
  V: 47
};

const SEGMENT_MAX_CHARS = 1000;
// A pause this long means a new thought/segment; brief pauses (reading,
// thinking mid-sentence) keep the text together as one block. Kept at
// 50s so pause-triggered closes + the 5s telemetry cadence land inside
// the 1-minute live-update budget.
const SEGMENT_PAUSE_MS = 50000;
// Hard cap on a single segment's age: continuous typing never exceeds
// this before the live segment is closed and shipped, so admin views
// always see keystrokes typed within the last minute (50s + 5s cadence).
const SEGMENT_MAX_AGE_MS = 50000;
// Inter-key gaps longer than this are not part of the typing rhythm
// (kept separate from SEGMENT_PAUSE_MS so think-gaps don't distort WPM).
const MAX_INTERVAL_GAP_MS = 5000;
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

  newSegment(now, context) {
    return {
      text: '',
      keyCount: 0,
      backspaceCount: 0,
      pasteCount: 0,
      intervals: [],
      start: now,
      lastAt: now,
      // Attribution: the window this segment was typed in. The server
      // prefers these over the batch-level values.
      activeApp: (context && context.activeApp) || undefined,
      activeAppTitle: (context && context.activeAppTitle) || undefined
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
   *
   * Every key is captured: printable characters are reconstructed into
   * the segment text; all other keys (specials, combos, modifiers) are
   * counted in keyCount so no keystroke goes unrecorded.
   * @param {Object} event - UiohookKeyboardEvent
   * @param {Object} context - { activeApp, activeAppTitle } at event time
   */
  onKeyDown(event, context) {
    if (!event || typeof event.keycode !== 'number') return;

    const now = Date.now();
    const keycode = event.keycode;

    // Foreground app changed ⇒ close the current segment so each upload
    // is attributed to the window it was actually typed in.
    if (
      this.segment
      && context
      && context.activeApp
      && this.segment.activeApp
      && context.activeApp !== this.segment.activeApp
    ) {
      this.finishSegment(this.segment.lastAt);
    }

    // Typing pause or max segment age ⇒ previous text is its own segment.
    if (
      this.segment
      && (now - this.segment.lastAt > SEGMENT_PAUSE_MS
        || now - this.segment.start > SEGMENT_MAX_AGE_MS)
    ) {
      this.finishSegment(this.segment.lastAt);
    }
    if (!this.segment) {
      this.segment = this.newSegment(now, context);
    } else if (!this.segment.activeApp && context && context.activeApp) {
      // Segment started without context (e.g. paste-first): backfill it.
      this.segment.activeApp = context.activeApp;
      this.segment.activeAppTitle = context.activeAppTitle;
    }

    const seg = this.segment;
    const sensitive = this.isSensitiveContext(context);

    // CapsLock: toggles case state and counts as a key press.
    if (keycode === KEY.CapsLock) {
      this.capsLock = !this.capsLock;
      seg.keyCount += 1;
      seg.lastAt = now;
      return;
    }

    // Shortcuts: never reconstruct text. Ctrl+V counts as a paste event;
    // every other Ctrl/Meta combo (Ctrl+C, Ctrl+R, Ctrl+S, …) still
    // counts as a key so the full keyboard usage is visible.
    if (event.ctrlKey || event.metaKey) {
      if (event.ctrlKey && keycode === KEY.V) {
        seg.pasteCount += 1;
      } else {
        seg.keyCount += 1;
      }
      seg.lastAt = now;
      return;
    }
    if (event.altKey) {
      seg.keyCount += 1;
      seg.lastAt = now;
      return;
    }

    // Backspace: correction counter (kept out of keyCount).
    if (keycode === KEY.Backspace) {
      seg.backspaceCount += 1;
      if (!sensitive && seg.text.length > 0) {
        seg.text = seg.text.slice(0, -1);
      }
      seg.lastAt = now;
      return;
    }

    // Enter (incl. numpad Enter): part of the text as a newline and
    // counted — but NOT a segment boundary, so multi-line sentences
    // stay in one block.
    if (keycode === KEY.Enter || keycode === KEY.NumpadEnter) {
      if (!sensitive) seg.text += '\n';
      seg.keyCount += 1;
      seg.lastAt = now;
      return;
    }

    // Resolve the printable character for this key (letters, all US-layout
    // symbols incl. shifted, numpad digits/operators).
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

    // Every remaining key counts — Tab, Esc, Delete, Insert, Home/End,
    // PageUp/PageDown, arrows, F1–F24, NumLock/ScrollLock/PrintScreen,
    // bare Shift/Ctrl/Alt/Win, numpad navigation, and any key the maps
    // don't know about — without polluting the reconstructed text.
    seg.keyCount += 1;
    seg.lastAt = now;

    if (ch === null) return;

    // Inter-key rhythm only for printable keys (mashing detection signal).
    // Gaps beyond MAX_INTERVAL_GAP_MS are think-time, not typing rhythm.
    if (this.lastPrintableAt && now - this.lastPrintableAt <= MAX_INTERVAL_GAP_MS) {
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
   * Return finished segments and clear the buffer.
   *
   * Non-final (the regular telemetry cadence): the LIVE segment is kept
   * buffering so an in-progress sentence is never chopped mid-thought —
   * EXCEPT when it hits a real boundary (pause / max age / app switch /
   * 1000 chars), which is what bounds keystroke → server latency to
   * ~55s even during continuous typing. It is otherwise returned once
   * drained with { final: true } (session end).
   * @param {Object} [options]
   * @param {boolean} [options.final] - Session ending: flush everything.
   * @returns {Array<Object>}
   */
  drain({ final = false } = {}) {
    const now = Date.now();
    if (
      this.segment
      && (final
        || now - this.segment.lastAt > SEGMENT_PAUSE_MS
        || now - this.segment.start > SEGMENT_MAX_AGE_MS)
    ) {
      this.finishSegment(this.segment.lastAt);
    }
    const segments = this.pending;
    this.pending = [];
    if (final) this.lastPrintableAt = 0;
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
