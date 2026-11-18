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
 *
 * Key coverage (kept in parity with the desktop agent):
 *  - Every key is captured. Printable characters (all symbols the browser
 *    reports, incl. numpad operators) go into `text`; every other key
 *    (Enter, Tab, Esc, Delete, arrows, F-keys, locks, modifiers, Ctrl
 *    combos like Ctrl+C/R) is counted in `keyCount` without polluting
 *    the reconstructed text. Backspace and Ctrl+V keep their dedicated
 *    counters (backspaceCount / pasteCount).
 *
 * Segmentation (kept in parity with the desktop agent):
 *  - A segment accumulates until a real boundary: a 50s typing pause or
 *    50s of total segment age or 1000 chars. Enter just appends a
 *    newline — it does NOT split — so a whole sentence/paragraph uploads
 *    as ONE text block. The caps bound worst-case keystroke → server
 *    latency to ~1 minute so admin views stay live.
 *  - Regular flushes are non-final: they ship finished segments only, so
 *    mid-sentence typing is never chopped at the tick boundary. The live
 *    segment is flushed with { final: true } on stop / page unload.
 */

const SEGMENT_PAUSE_MS = 50000;
const SEGMENT_MAX_AGE_MS = 50000;
const MAX_INTERVAL_GAP_MS = 5000;
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
   * Every key is captured: printable characters are reconstructed into
   * the text; all other keys are counted in keyCount.
   * @param {KeyboardEvent} event
   */
  onKeydown(event) {
    if (!event) return;

    const now = Date.now();
    const key = event.key;

    // IME composition / dead keys — no reliable character.
    if (key === 'Dead' || key === 'Process' || event.isComposing) return;

    const secure = isSecureField(event.target);

    // Typing pause or max segment age ⇒ previous text is its own segment.
    if (
      this.segment
      && (now - this.segment.lastAt > SEGMENT_PAUSE_MS
        || now - this.segment.start > SEGMENT_MAX_AGE_MS)
    ) {
      this._finishSegment(this.segment.lastAt);
    }
    if (!this.segment) {
      this.segment = this._newSegment(now);
    }
    const seg = this.segment;

    // Shortcuts (Ctrl+C/V/X/R, Cmd+…) never contribute text. Ctrl+V is
    // a paste event; every other combo still counts as a key press.
    if (event.ctrlKey || event.metaKey) {
      if (event.ctrlKey && (key === 'v' || key === 'V')) {
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

    if (key === 'Backspace') {
      seg.backspaceCount += 1;
      if (!secure && seg.text.length > 0) {
        seg.text = seg.text.slice(0, -1);
      }
      seg.lastAt = now;
      return;
    }

    if (key === 'Enter') {
      // Enter is part of the text (newline), NOT a segment boundary.
      if (!secure) seg.text += '\n';
      seg.keyCount += 1;
      seg.lastAt = now;
      return;
    }

    // Printable character (browser already applies shift/caps), including
    // numpad operators ('*', '+', '-', '/').
    if (key.length === 1) {
      seg.keyCount += 1;
      seg.lastAt = now;

      if (this.lastPrintableAt && now - this.lastPrintableAt <= MAX_INTERVAL_GAP_MS) {
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
      return;
    }

    // Everything else — Tab, Esc, Delete, Insert, Home/End, PageUp/
    // PageDown, arrows, F1–F12, Shift/Control/Alt/Meta, CapsLock,
    // NumLock, ScrollLock, PrintScreen — counts without touching text.
    seg.keyCount += 1;
    seg.lastAt = now;
  }

  hasPending() {
    if (this.pending.length > 0) return true;
    if (!this.segment) return false;
    return this.segment.text.trim().length > 0 || this.segment.keyCount > 0;
  }

  /**
   * Drain finished segments and clear the buffer.
   * Non-final (regular ticks): the LIVE segment is kept buffering so an
   * in-progress sentence is never split; it ships once it hits a real
   * boundary (50s pause / 50s max age / 1000 chars) or on { final: true }
   * (stop/unload).
   */
  drain({ final = false } = {}) {
    const now = Date.now();
    if (
      this.segment
      && (final
        || now - this.segment.lastAt > SEGMENT_PAUSE_MS
        || now - this.segment.start > SEGMENT_MAX_AGE_MS)
    ) {
      this._finishSegment(this.segment.lastAt);
    }
    const segments = this.pending;
    this.pending = [];
    if (final) this.lastPrintableAt = 0;
    return segments;
  }

  /** Put segments back after a retryable upload failure. */
  requeue(segments) {
    if (!Array.isArray(segments) || segments.length === 0) return;
    this.pending = [...segments, ...this.pending].slice(0, MAX_PENDING_SEGMENTS);
  }
}

export default KeystrokeTextCapture;
