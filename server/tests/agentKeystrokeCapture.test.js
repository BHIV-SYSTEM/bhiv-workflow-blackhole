/**
 * agentKeystrokeCapture.test.js
 *
 * Contract test for the DESKTOP AGENT keystroke-activity pipeline:
 *   real employee-agent/src/utils/keystrokeCapture.js
 *     → simulated uiohook keydown events (Windows scan codes)
 *     → drained segments (exact payload the agent uploads)
 *     → POST /api/agent/keystroke/ingest (real route)
 *     → KeystrokeLog docs with server-side quality classification
 *
 * PRIVACY CONTRACT: typed characters are NEVER captured. Every segment
 * ships `text: ""` while keyCount / backspaceCount / pasteCount /
 * intervals are preserved so the WPM + keymeshing score still works.
 */

"use strict";

process.env.JWT_SECRET = "test-jwt-secret-for-unit-tests-only";
process.env.MONGODB_URI = "mongodb://localhost:27017/test";

const request = require("supertest");
const express = require("express");

// ── Auth: pass-through with a fixed employee identity ────────────────────────
jest.mock("../middleware/auth", () => (req, res, next) => {
  req.user = { id: "emp1", role: "Employee" };
  next();
});

// ── Models used by the ingest gate + storage ─────────────────────────────────
const mockInsertMany = jest.fn();
jest.mock("../models/KeystrokeLog", () => ({
  insertMany: (...args) => mockInsertMany(...args),
  find: jest.fn(),
}));

const mockUserFindById = jest.fn();
jest.mock("../models/User", () => ({
  findById: (...args) => mockUserFindById(...args),
}));

const mockConsentFindOne = jest.fn();
jest.mock("../models/Consent", () => ({
  findOne: (...args) => mockConsentFindOne(...args),
}));

const mockAttendanceFindOne = jest.fn();
jest.mock("../models/Attendance", () => ({
  findOne: (...args) => mockAttendanceFindOne(...args),
}));

const mockDailyFindOne = jest.fn();
jest.mock("../models/DailyAttendance", () => ({
  findOne: (...args) => mockDailyFindOne(...args),
}));

// ── Routers under test ───────────────────────────────────────────────────────
const agentRouter = require("../routes/agentActivity");
const KeystrokeCapture = require("../../employee-agent/src/utils/keystrokeCapture");

const app = express();
app.use(express.json());
app.use("/api/agent", agentRouter);

// ── Gate helpers (same shapes as keystrokeIngest.test.js) ────────────────────
function userQuery(result) {
  return { select: jest.fn().mockReturnValue({ lean: async () => result }) };
}
function consentQuery(result) {
  return { lean: async () => result };
}
function dayQuery(activeDay) {
  return { sort: jest.fn().mockResolvedValue(activeDay) };
}

const ACTIVE_DAY = { _id: "day1", startDayTime: new Date(), date: new Date() };

function allowAllGates() {
  mockUserFindById.mockReturnValue(userQuery({ monitoringPaused: false }));
  mockConsentFindOne.mockReturnValue(consentQuery(null));
  mockAttendanceFindOne.mockReturnValue(dayQuery(ACTIVE_DAY));
  mockDailyFindOne.mockReturnValue(dayQuery(null));
}

// ── uiohook scan-code helpers (UiohookKey, US layout) ────────────────────────
const SCAN = {
  a: 30, b: 48, c: 46, d: 32, e: 18, f: 33, g: 34, h: 35, i: 23, j: 36,
  k: 37, l: 38, m: 50, n: 49, o: 24, p: 25, q: 16, r: 19, s: 31, t: 20,
  u: 22, v: 47, w: 17, x: 45, y: 21, z: 44,
  "0": 11, "1": 2, "2": 3, "3": 4, "4": 5, "5": 6, "6": 7, "7": 8, "8": 9, "9": 10,
  space: 57, enter: 28, backspace: 14, tab: 15, escape: 1, capsLock: 58,
  shift: 42, ctrl: 29, comma: 51, period: 52, slash: 53, minus: 12, equal: 13,
  semicolon: 39,
};

function keyEvent(keycode, { shift = false, ctrl = false, meta = false, alt = false } = {}) {
  return { keycode, shiftKey: shift, ctrlKey: ctrl, metaKey: meta, altKey: alt };
}

/** Type a plain string (letters/digits/space/;) into the capture. */
function typeText(capture, text, context) {
  for (const ch of text) {
    if (ch === " ") {
      capture.onKeyDown(keyEvent(SCAN.space), context);
      continue;
    }
    if (ch === ";") {
      capture.onKeyDown(keyEvent(SCAN.semicolon), context);
      continue;
    }
    const code = SCAN[ch.toLowerCase()];
    if (code === undefined) throw new Error(`No scan code for char: ${ch}`);
    capture.onKeyDown(keyEvent(code), context);
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  allowAllGates();
  mockInsertMany.mockResolvedValue([]);
});

// ─────────────────────────────────────────────────────────────────────────────
describe("agent KeystrokeCapture → uiohook event reconstruction", () => {
  const CTX = { activeApp: "Notepad", activeAppTitle: "notes.txt" };

  it("counts a typed sentence without recording any characters", () => {
    const capture = new KeystrokeCapture();
    typeText(capture, "hello world", CTX);
    capture.onKeyDown(keyEvent(SCAN.enter), CTX); // counted, not a boundary

    const segments = capture.drain({ final: true });
    expect(segments).toHaveLength(1);
    // PRIVACY: no typed content ever leaves the agent.
    expect(segments[0].text).toBe("");
    // 11 printable chars + Enter (the agent counts Enter as a key too)
    expect(segments[0].keyCount).toBe(12);
    expect(segments[0].intervals.length).toBeGreaterThan(0);
    expect(segments[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("keeps Shift/CapsLock as counts only (no casing captured)", () => {
    const capture = new KeystrokeCapture();
    capture.onKeyDown(keyEvent(SCAN.h, { shift: true }), CTX); // H
    capture.onKeyDown(keyEvent(SCAN.i), CTX); // i
    capture.onKeyDown(keyEvent(SCAN.capsLock), CTX); // caps on
    capture.onKeyDown(keyEvent(SCAN.a), CTX); // A
    capture.onKeyDown(keyEvent(SCAN.enter), CTX);

    const segments = capture.drain({ final: true });
    expect(segments[0].text).toBe("");
    expect(segments[0].keyCount).toBe(5); // H + i + CapsLock + A + Enter
  });

  it("keeps shifted punctuation as counts only (no symbols captured)", () => {
    const capture = new KeystrokeCapture();
    capture.onKeyDown(keyEvent(SCAN["1"], { shift: true }), CTX); // !
    capture.onKeyDown(keyEvent(SCAN.slash, { shift: true }), CTX); // ?
    capture.onKeyDown(keyEvent(SCAN.enter), CTX);

    const segments = capture.drain({ final: true });
    expect(segments[0].text).toBe("");
    expect(segments[0].keyCount).toBe(3);
  });

  it("Backspace is counted as a correction but removes no content", () => {
    const capture = new KeystrokeCapture();
    typeText(capture, "abc", CTX);
    capture.onKeyDown(keyEvent(SCAN.backspace), CTX); // → still no text
    capture.onKeyDown(keyEvent(SCAN.enter), CTX);

    const segments = capture.drain({ final: true });
    expect(segments[0].text).toBe("");
    expect(segments[0].backspaceCount).toBe(1);
    expect(segments[0].keyCount).toBe(4);
  });

  it("Ctrl+V counts as a paste and never records shortcut text", () => {
    const capture = new KeystrokeCapture();
    typeText(capture, "hi", CTX);
    capture.onKeyDown(keyEvent(SCAN.v, { ctrl: true }), CTX);
    capture.onKeyDown(keyEvent(SCAN.enter), CTX);

    const segments = capture.drain({ final: true });
    expect(segments[0].pasteCount).toBe(1);
    expect(segments[0].text).toBe("");
    expect(segments[0].keyCount).toBe(3);
  });

  it("never records text typed into sensitive (login/OTP) windows", () => {
    const capture = new KeystrokeCapture();
    const loginCtx = { activeApp: "Google Chrome", activeAppTitle: "Sign in - Gmail" };
    typeText(capture, "secretpassword", loginCtx);
    capture.onKeyDown(keyEvent(SCAN.enter), loginCtx);

    const segments = capture.drain({ final: true });
    expect(segments).toHaveLength(1);
    // Sensitive window: keys are counted, but no content is recorded.
    // (Since no content is EVER recorded, this holds for every window.)
    expect(segments[0].text).toBe("");
    expect(segments[0].keyCount).toBe(15); // 14 chars + Enter
  });

  it("starts a new segment after a 50s typing pause", () => {
    let now = 1_000_000;
    const spy = jest.spyOn(Date, "now").mockImplementation(() => now);

    try {
      const capture = new KeystrokeCapture();
      typeText(capture, "one", CTX);
      now += 51_000; // pause beyond SEGMENT_PAUSE_MS (50s)
      typeText(capture, "two", CTX);
      capture.onKeyDown(keyEvent(SCAN.enter), CTX);

      const segments = capture.drain({ final: true });
      expect(segments).toHaveLength(2);
      expect(segments.map((s) => s.text)).toEqual(["", ""]);
      expect(segments.map((s) => s.keyCount)).toEqual([3, 4]); // one / two+Enter
    } finally {
      spy.mockRestore();
    }
  });

  it("closes a continuously-typed segment at the 50s max-age cap", () => {
    let now = 1_000_000;
    const spy = jest.spyOn(Date, "now").mockImplementation(() => now);

    try {
      const capture = new KeystrokeCapture();
      typeText(capture, "one", CTX);
      now += 20_000; // gap < pause limit — still one thought
      typeText(capture, "two", CTX);
      now += 20_000; // gap < pause limit — still one thought
      typeText(capture, "three", CTX);
      // Segment age is now 55s (> SEGMENT_MAX_AGE_MS of 50s) while the
      // last inter-key gap is only 15s (< SEGMENT_PAUSE_MS), so only the
      // age cap can close it.
      now += 15_000;

      // Non-final drain (the regular telemetry cadence) must ship it now
      // so admin views see keystrokes within ~1 minute of typing.
      const segments = capture.drain();
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe("");
      expect(segments[0].keyCount).toBe(11); // one + two + three

      // A fresh segment starts for the next keys.
      typeText(capture, "four", CTX);
      const rest = capture.drain({ final: true });
      expect(rest.map((s) => s.text)).toEqual([""]);
      expect(rest.map((s) => s.keyCount)).toEqual([4]);
    } finally {
      spy.mockRestore();
    }
  });

  it("keeps one sentence together across a short typing pause", () => {
    let now = 1_000_000;
    const spy = jest.spyOn(Date, "now").mockImplementation(() => now);

    try {
      const capture = new KeystrokeCapture();
      typeText(capture, "hello ", CTX);
      now += 10_000; // 10s think — still one thought (pause limit is 50s)
      typeText(capture, "bye", CTX);
      capture.onKeyDown(keyEvent(SCAN.enter), CTX);

      const segments = capture.drain({ final: true });
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe("");
      expect(segments[0].keyCount).toBe(10); // "hello " + "bye" + Enter
    } finally {
      spy.mockRestore();
    }
  });

  it("does not chop live typing at a regular (non-final) telemetry drain", () => {
    const capture = new KeystrokeCapture();
    typeText(capture, "hello", CTX);

    // Regular cadence: the live segment must NOT be flushed mid-burst.
    expect(capture.drain()).toHaveLength(0);

    typeText(capture, " world", CTX);
    const segments = capture.drain({ final: true });
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe("");
    expect(segments[0].keyCount).toBe(11); // "hello" + " world"
  });

  it("keeps multi-line activity in one segment (Enter is not a boundary)", () => {
    const capture = new KeystrokeCapture();
    typeText(capture, "line one", CTX);
    capture.onKeyDown(keyEvent(SCAN.enter), CTX);
    typeText(capture, "line two", CTX);

    const segments = capture.drain({ final: true });
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe("");
    expect(segments[0].keyCount).toBe(17); // 8 + Enter + 8
  });

  it("starts a new segment when the foreground app changes (attribution)", () => {
    const capture = new KeystrokeCapture();
    typeText(capture, "abc", CTX);
    const chromeCtx = { activeApp: "Google Chrome", activeAppTitle: "Docs" };
    typeText(capture, "def", chromeCtx);

    const segments = capture.drain({ final: true });
    expect(segments).toHaveLength(2);
    expect(segments.map((s) => s.text)).toEqual(["", ""]);
    expect(segments.map((s) => s.keyCount)).toEqual([3, 3]);
    expect(segments[0].activeApp).toBe("Notepad");
    expect(segments[1].activeApp).toBe("Google Chrome");
  });

  it("counts modifier-only presses as keys (text stays empty)", () => {
    const capture = new KeystrokeCapture();
    capture.onKeyDown(keyEvent(SCAN.shift), CTX);
    capture.onKeyDown(keyEvent(SCAN.escape), CTX);

    const segments = capture.drain({ final: true });
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe("");
    expect(segments[0].keyCount).toBe(2); // Shift + Esc are still keystrokes
  });

  it("counts every special key (F-keys, Delete, arrows, Home)", () => {
    const capture = new KeystrokeCapture();
    typeText(capture, "hi", CTX);
    capture.onKeyDown(keyEvent(63), CTX); // F5
    capture.onKeyDown(keyEvent(3667), CTX); // Delete
    capture.onKeyDown(keyEvent(57416), CTX); // ArrowUp
    capture.onKeyDown(keyEvent(3655), CTX); // Home
    capture.onKeyDown(keyEvent(69), CTX); // NumLock

    const segments = capture.drain({ final: true });
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe("");
    expect(segments[0].keyCount).toBe(7); // 2 letters + 5 special keys
  });

  it("counts Ctrl combos (copy/save/reload) without recording shortcut text", () => {
    const capture = new KeystrokeCapture();
    typeText(capture, "doc", CTX);
    capture.onKeyDown(keyEvent(SCAN.c, { ctrl: true }), CTX); // Ctrl+C
    capture.onKeyDown(keyEvent(SCAN.r, { ctrl: true }), CTX); // Ctrl+R
    capture.onKeyDown(keyEvent(SCAN.s, { ctrl: true }), CTX); // Ctrl+S

    const segments = capture.drain({ final: true });
    expect(segments[0].text).toBe("");
    expect(segments[0].keyCount).toBe(6); // 3 letters + 3 combos
    expect(segments[0].pasteCount).toBe(0);
  });

  it("counts numpad operator keys without recording the symbols", () => {
    const capture = new KeystrokeCapture();
    capture.onKeyDown(keyEvent(55), CTX); // numpad *
    capture.onKeyDown(keyEvent(78), CTX); // numpad +
    capture.onKeyDown(keyEvent(74), CTX); // numpad -
    capture.onKeyDown(keyEvent(3637), CTX); // numpad /
    capture.onKeyDown(keyEvent(3612), CTX); // numpad Enter

    const segments = capture.drain({ final: true });
    expect(segments[0].text).toBe("");
    expect(segments[0].keyCount).toBe(5);
  });

  it("counts bare modifier keydowns (Shift/Ctrl pressed alone)", () => {
    const capture = new KeystrokeCapture();
    typeText(capture, "a", CTX);
    capture.onKeyDown(keyEvent(42), CTX); // bare Shift
    capture.onKeyDown(keyEvent(29), CTX); // bare Ctrl
    capture.onKeyDown(keyEvent(56), CTX); // bare Alt

    const segments = capture.drain({ final: true });
    expect(segments[0].text).toBe("");
    expect(segments[0].keyCount).toBe(4); // 1 letter + 3 modifiers
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("agent-captured segments → POST /api/agent/keystroke/ingest", () => {
  /**
   * Type `text` at a fixed inter-key cadence (ms) so the produced intervals
   * match real uiohook event streams instead of a same-millisecond burst.
   * Returns the capture ready to drain.
   */
  function typeAtCadence(text, stepMs, ctx) {
    const capture = new KeystrokeCapture();
    let now = 5_000_000;
    const spy = jest.spyOn(Date, "now").mockImplementation(() => now);
    try {
      for (const ch of text) {
        now += stepMs;
        if (ch === " ") capture.onKeyDown(keyEvent(SCAN.space), ctx);
        else if (ch === ";") capture.onKeyDown(keyEvent(SCAN.semicolon), ctx);
        else capture.onKeyDown(keyEvent(SCAN[ch.toLowerCase()]), ctx);
      }
      now += stepMs;
      capture.onKeyDown(keyEvent(SCAN.enter), ctx);
    } finally {
      spy.mockRestore();
    }
    return capture;
  }

  /** Build the exact payload activityTracker.flushKeystrokeSegments() sends. */
  function agentPayload(capture, { activeApp = "Notepad", activeAppTitle = "notes.txt" } = {}) {
    return {
      attendanceId: "att1",
      activeApp,
      activeAppTitle,
      activeTaskId: null,
      segments: capture.drain({ final: true }),
    };
  }

  it("stores a full agent-typed sentence with quality classification", async () => {
    const ctx = { activeApp: "Notepad", activeAppTitle: "notes.txt" };
    // Human-ish cadence (140 ms between keys)
    const capture = typeAtCadence(
      "please review the quarterly report and share your feedback before friday",
      140,
      ctx
    );

    const res = await request(app)
      .post("/api/agent/keystroke/ingest")
      .send(agentPayload(capture));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.stored).toBe(1);

    const docs = mockInsertMany.mock.calls[0][0];
    expect(docs[0].employee).toBe("emp1");
    expect(docs[0].session_id).toBe("att1");
    expect(docs[0].application_name).toBe("Notepad");
    expect(docs[0].text).toBe("");
    expect(docs[0].quality.classification).toBe("valuable");
    expect(docs[0].quality.score).toBeGreaterThan(60);
    expect(docs[0].capture.char_count).toBeGreaterThan(50);
    expect(docs[0].capture.key_count).toBe(73); // 72 chars + Enter
    expect(docs[0].capture.mean_interval_ms).toBeGreaterThanOrEqual(140);
    expect(res.body.classifications.valuable).toBe(1);
  });

  it("classifies agent key-mashing segments as key_mashing", async () => {
    const ctx = { activeApp: "Notepad", activeAppTitle: "scratch.txt" };
    // Machine-like cadence (40 ms, perfectly regular) → superhuman rhythm
    const capture = typeAtCadence("asdfjkl;asdfjkl;qwertyuiop", 40, ctx);

    const res = await request(app)
      .post("/api/agent/keystroke/ingest")
      .send(agentPayload(capture));

    expect(res.status).toBe(200);
    const docs = mockInsertMany.mock.calls[0][0];
    expect(docs[0].quality.classification).toBe("key_mashing");
    expect(docs[0].quality.score).toBeLessThanOrEqual(30);
    expect(res.body.classifications.key_mashing).toBe(1);
  });

  it("stores special-key counts without text pollution (short text stays valuable)", async () => {
    const ctx = { activeApp: "Notepad", activeAppTitle: "notes.txt" };
    const capture = new KeystrokeCapture();
    typeText(capture, "ok", ctx);
    capture.onKeyDown(keyEvent(63), ctx); // F5
    capture.onKeyDown(keyEvent(3667), ctx); // Delete

    const res = await request(app)
      .post("/api/agent/keystroke/ingest")
      .send(agentPayload(capture));

    expect(res.status).toBe(200);
    const docs = mockInsertMany.mock.calls[0][0];
    expect(docs[0].text).toBe(""); // specials never pollute the text
    expect(docs[0].capture.key_count).toBe(4); // o, k, F5, Delete
    expect(docs[0].quality.classification).toBe("valuable"); // size ≠ quality
  });

  it("respects the consent gate before storing agent text", async () => {
    mockConsentFindOne.mockReturnValue(
      consentQuery({ monitoringEnabled: false, isActive: true })
    );

    const capture = new KeystrokeCapture();
    const ctx = { activeApp: "Notepad", activeAppTitle: "notes.txt" };
    typeText(capture, "blocked text", ctx);
    capture.onKeyDown(keyEvent(SCAN.enter), ctx);

    const res = await request(app)
      .post("/api/agent/keystroke/ingest")
      .send(agentPayload(capture));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CONSENT_DENIED");
    expect(mockInsertMany).not.toHaveBeenCalled();
  });

  it("respects the open-workday gate before storing agent text", async () => {
    mockAttendanceFindOne.mockReturnValue(dayQuery(null));
    mockDailyFindOne.mockReturnValue(dayQuery(null));

    const capture = new KeystrokeCapture();
    const ctx = { activeApp: "Notepad", activeAppTitle: "notes.txt" };
    typeText(capture, "no active day", ctx);
    capture.onKeyDown(keyEvent(SCAN.enter), ctx);

    const res = await request(app)
      .post("/api/agent/keystroke/ingest")
      .send(agentPayload(capture));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("DAY_NOT_ACTIVE");
    expect(mockInsertMany).not.toHaveBeenCalled();
  });

  it("sends an empty batch as a no-op without calling insertMany", async () => {
    const capture = new KeystrokeCapture();

    const res = await request(app)
      .post("/api/agent/keystroke/ingest")
      .send(agentPayload(capture));

    expect(res.status).toBe(400); // segments array required / empty
    expect(mockInsertMany).not.toHaveBeenCalled();
  });
});
