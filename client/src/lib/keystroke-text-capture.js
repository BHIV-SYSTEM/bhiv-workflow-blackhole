/**
 * Browser-side typed-text capture for the workflow tab.
 *
 * Unlike the desktop agent (which maps raw uIOhook keycodes), the browser
 * gives us the real character in `event.key`, so reconstruction is direct.
 * Segments follow the same protocol as the agent:
 *   POST /api/agent/keystroke/ingest  { attendanceId, segments[] }
 *
 * Privacy guards:
 *  - Never captures content typed into password / new-password fields
 *  - Ctrl/Meta shortcuts never insert text (Ctrl+V counted as paste)
 *  - Segments end on Enter, 5 s pause, or 1000 chars
 */

const SEGMENT_PAUSE_MS = 5000;
const SEGMENT_MAX_CHARS = 1000;
const MAX_INTERVALS = 500;
const MAX_PENDING_SEGMENTS = 50;

function isSecureField(target) {
  if (!target || typeof target !== 'object') return false;
  const el = target;
  if (el.tagName === 'TEXTAREA') {
    return (el.getAttribute('autocomplete') || '').toLowerCase() === 'one-time-code';
  }
  if (el.tagName === 'INPUT') {
    const type = (el.type || 'text').toLowerCase();
    if (type === 'password') return true;
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
    if (ac === 'current-password' || ac === 'new-password' || ac === 'one-time-code') return true;
  }
  // Anything explicitly marked sensitive by the app
  if (el.closest && el.closest('[data-sensitive="true"], [data-keystroke-ignore]')) return true;
  return false;
}

class KeystrokeTextCapture {
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

  _newSegment(now) {
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

  _pushSegment(segment, now) {
    if (!segment) return;
    if (!(segment.text.trim().length > 0 || segment.keyCount > 0)) return;
    segment.durationMs = Math.max(0, (segment.lastAt || now) - segment.start);
    this.pending.push(segment);
    if (this.pending.length > MAX_PENDING_SEGMENTS) {
      this.pending.shift();
    }
  }

  _finishSegment(now) {
    if (!this.segment) return;
    this._pushSegment(this.segment, now);
    this.segment = null;
  }

  /**
   * Feed one keydown event from the workflow tab.
   * @param {KeyboardEvent} event
   */
  onKeydown(event) {
    if (!event) return;

    const now = Date.now();
    const key = event.key;

    // Shortcuts (Ctrl+C/V/X, Cmd+…) never contribute text.
    if (event.ctrlKey || event.metaKey) {
      if (event.ctrlKey && (key === 'v' || key === 'V')) {
        if (!this.segment) this.segment = this._newSegment(now);
        this.segment.pasteCount += 1;
        this.segment.lastAt = now;
      }
      return;
    }
    if (event.altKey) return;

    // IME composition / dead keys — no reliable character.
    if (key === 'Dead' || key === 'Process' || event.isComposing) return;

    const secure = isSecureField(event.target);

    // Typing pause ⇒ previous text is its own segment.
    if (this.segment && now - this.segment.lastAt > SEGMENT_PAUSE_MS) {
      this._finishSegment(this.segment.lastAt);
    }
    if (!this.segment) {
      this.segment = this._newSegment(now);
    }
    const seg = this.segment;

    if (key === 'Backspace') {
      seg.backspaceCount += 1;
      if (!secure && seg.text.length > 0) {
        seg.text = seg.text.slice(0, -1);
      }
      seg.lastAt = now;
      return;
    }

    if (key === 'Enter') {
      if (!secure) seg.text += '\n';
      seg.keyCount += 1;
      seg.lastAt = now;
      this._finishSegment(now);
      return;
    }

    if (key === 'Tab' || key === 'Escape') {
      seg.lastAt = now;
      return;
    }

    // Printable character (browser already applies shift/caps).
    if (key.length !== 1) return; // Shift, ArrowUp, F5, …

    seg.keyCount += 1;
    seg.lastAt = now;

    if (this.lastPrintableAt && now - this.lastPrintableAt <= SEGMENT_PAUSE_MS) {
      seg.intervals.push(now - this.lastPrintableAt);
      if (seg.intervals.length > MAX_INTERVALS) {
        seg.intervals.splice(0, seg.intervals.length - MAX_INTERVALS);
      }
    }
    this.lastPrintableAt = now;

    if (secure) return; // count the key, never the content

    seg.text += key;
    if (seg.text.length >= SEGMENT_MAX_CHARS) {
      this._finishSegment(now);
    }
  }

  hasPending() {
    if (this.pending.length > 0) return true;
    if (!this.segment) return false;
    return this.segment.text.trim().length > 0 || this.segment.keyCount > 0;
  }

  /** Drain all finished segments (plus the live one) and clear the buffer. */
  drain() {
    this._finishSegment(Date.now());
    const segments = this.pending;
    this.pending = [];
    this.lastPrintableAt = 0;
    return segments;
  }

  /** Put segments back after a retryable upload failure. */
  requeue(segments) {
    if (!Array.isArray(segments) || segments.length === 0) return;
    this.pending = [...segments, ...this.pending].slice(0, MAX_PENDING_SEGMENTS);
  }
}

export default KeystrokeTextCapture;
