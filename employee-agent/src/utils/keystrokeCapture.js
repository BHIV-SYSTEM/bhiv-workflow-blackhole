/**
 * Keystroke Activity Capture — counts and rhythm only, NEVER content.
 *
 * PRIVACY CONTRACT (enforced here, asserted by
 * server/tests/agentKeystrokeCapture.test.js):
 *   Typed characters are NEVER reconstructed, stored, logged or uploaded.
 *   The `text` field of every segment is always the empty string.
 *   What is captured instead:
 *     - keyCount        total key presses (every key on the keyboard)
 *     - backspaceCount  correction ratio signal
 *     - pasteCount      Ctrl+V events
 *     - intervals       inter-key timings → WPM / rhythm / keymeshing score
 *     - activeApp       which window the activity happened in
 *     - durationMs      how long the typing burst lasted
 *   So scoring ("valuable keymeshing") keeps working while passwords,
 *   messages and document contents can never leave this machine.
 *
 * uIOhook only reports keycodes (no characters), so this module maps
 * keycodes → printable-or-not for the US layout, maintains a live
 * segment buffer with inter-key intervals, and hands finished segments
 * to the activity tracker for upload.
 *
 * Design notes:
 *  - A segment keeps accumulating until a REAL boundary: the foreground
 *    app changes, a 50s typing pause, 50s of total segment age, or the
 *    session ends (drain with { final: true }). Enter is not a boundary,
 *    so a whole sentence/paragraph of activity stays ONE block. The
 *    pause/age caps bound worst-case keystroke → server latency to ~55s
 *    (50s cap + 5s telemetry cadence).
 *  - Regular telemetry drains are non-final: they ship finished segments
 *    only, so mid-sentence typing is never chopped at the tick boundary.
 *  - EVERY key on the keyboard is captured as a COUNT: printable keys
 *    additionally drive the inter-key rhythm; every other key (Enter,
 *    Tab, Esc, Delete, arrows, F-keys, locks, modifiers, Ctrl/Meta
 *    combos like Ctrl+C/R) is counted in keyCount. Backspace and Ctrl+V
 *    keep their dedicated counters (backspaceCount / pasteCount).
 */

// US layout: uiohook keycode → base character (no modifiers). Used ONLY
// to decide whether a key is printable (so rhythm is measured between
// printable keys). The characters themselves are never stored.
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

const KEY = {
  Backspace: 14,
  Tab: 15,
  Enter: 28,
  NumpadEnter: 3612,
  CapsLock: 58,
  Escape: 1,
  V: 47
};

// A pause this long means a new segment; brief pauses (reading,
// thinking mid-sentence) keep the activity together as one block. Kept
// at 50s so pause-triggered closes + the 5s telemetry cadence land
// inside the 1-minute live-update budget.
const SEGMENT_PAUSE_MS = 50000;
// Hard cap on a single segment's age: continuous typing never exceeds
// this before the live segment is closed and shipped.
const SEGMENT_MAX_AGE_MS = 50000;
// Inter-key gaps longer than this are not part of the typing rhythm
// (kept separate from SEGMENT_PAUSE_MS so think-gaps don't distort WPM).
const MAX_INTERVAL_GAP_MS = 5000;
const MAX_INTERVALS = 500;
const MAX_PENDING_SEGMENTS = 50;

class KeystrokeCapture {
  constructor() {
    this.pending = [];
    this.segment = null;
    this.lastPrintableAt = 0;
  }

  reset() {
    this.pending = [];
    this.segment = null;
    this.lastPrintableAt = 0;
  }

  newSegment(now, context) {
    return {
      // ALWAYS empty — no typed content is ever captured (privacy).
      text: '',
      keyCount: 0,
      backspaceCount: 0,
      pasteCount: 0,
      intervals: [],
      start: now,
      lastAt: now,
      // Attribution: the window this activity happened in. The server
      // prefers these over the batch-level values.
      activeApp: (context && context.activeApp) || undefined,
      activeAppTitle: (context && context.activeAppTitle) || undefined
    };
  }

  pushSegment(segment, now) {
    if (!segment) return;
    const meaningful = segment.keyCount > 0
      || segment.backspaceCount > 0
      || segment.pasteCount > 0;
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
   * Every key is counted; no character is ever recorded.
   * @param {Object} event - UiohookKeyboardEvent
   * @param {Object} context - { activeApp, activeAppTitle } at event time
   */
  onKeyDown(event, context) {
    if (!event || typeof event.keycode !== 'number') return;

    const now = Date.now();
    const keycode = event.keycode;

    // Foreground app changed ⇒ close the current segment so each upload
    // is attributed to the window it was actually used in.
    if (
      this.segment
      && context
      && context.activeApp
      && this.segment.activeApp
      && context.activeApp !== this.segment.activeApp
    ) {
      this.finishSegment(this.segment.lastAt);
    }

    // Typing pause or max segment age ⇒ previous burst is its own segment.
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
      // Segment started without context: backfill it.
      this.segment.activeApp = context.activeApp;
      this.segment.activeAppTitle = context.activeAppTitle;
    }

    const seg = this.segment;

    // CapsLock counts as a key press.
    if (keycode === KEY.CapsLock) {
      seg.keyCount += 1;
      seg.lastAt = now;
      return;
    }

    // Shortcuts: Ctrl+V counts as a paste event; every other Ctrl/Meta
    // combo (Ctrl+C, Ctrl+R, Ctrl+S, …) still counts as a key so the
    // full keyboard usage is visible.
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
      seg.lastAt = now;
      return;
    }

    // Enter (incl. numpad Enter): counted, and NOT a segment boundary.
    if (keycode === KEY.Enter || keycode === KEY.NumpadEnter) {
      seg.keyCount += 1;
      seg.lastAt = now;
      return;
    }

    // Is this a printable key? Used ONLY to decide whether it belongs to
    // the typing rhythm — the character itself is discarded.
    const printable = CHAR_MAP[keycode] !== undefined;

    // Every remaining key counts — Tab, Esc, Delete, Insert, Home/End,
    // PageUp/PageDown, arrows, F1–F24, NumLock/ScrollLock/PrintScreen,
    // bare Shift/Ctrl/Alt/Win, numpad navigation, and any key the maps
    // don't know about.
    seg.keyCount += 1;
    seg.lastAt = now;

    if (!printable) return;

    // Inter-key rhythm only for printable keys (mashing detection signal).
    // Gaps beyond MAX_INTERVAL_GAP_MS are think-time, not typing rhythm.
    if (this.lastPrintableAt && now - this.lastPrintableAt <= MAX_INTERVAL_GAP_MS) {
      seg.intervals.push(now - this.lastPrintableAt);
      if (seg.intervals.length > MAX_INTERVALS) {
        seg.intervals.splice(0, seg.intervals.length - MAX_INTERVALS);
      }
    }
    this.lastPrintableAt = now;
  }

  /**
   * Return finished segments and clear the buffer.
   *
   * Non-final (the regular telemetry cadence): the LIVE segment is kept
   * buffering so an in-progress burst is never chopped mid-thought —
   * EXCEPT when it hits a real boundary (pause / max age / app switch),
   * which is what bounds keystroke → server latency to ~55s even during
   * continuous typing. It is otherwise returned once drained with
   * { final: true } (session end).
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
