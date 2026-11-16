/**
 * keystrokeIngest.test.js
 *
 * End-to-end route tests for the typed-text keystroke pipeline:
 *   - POST /api/agent/keystroke/ingest  (desktop agent upload)
 *   - GET  /api/monitoring/employees/:id/keystrokes  (admin panel read)
 *
 * Strategy: minimal Express app mounting the real routers with mocked
 * auth, models, and heavy services (no MongoDB / network required).
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
const mockKeystrokeFind = jest.fn();
jest.mock("../models/KeystrokeLog", () => ({
  insertMany: (...args) => mockInsertMany(...args),
  find: (...args) => mockKeystrokeFind(...args),
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

// ── Heavy services pulled in by monitoring.js (side effects at load) ─────────
jest.mock("../services/activityTracker", () => ({
  getActivityStatus: jest.fn(() => null),
  getActivityLogs: jest.fn(() => []),
}));
jest.mock("../services/screenCapture", () => ({}));
jest.mock("../services/websiteMonitor", () => ({}));
jest.mock("../services/intelligentScreenCapture", () => ({}));
jest.mock("../services/groqAIService", () => ({}));
jest.mock("../services/ocrAnalysisService", () => ({}));
jest.mock("../services/reportGenerator", () => ({}));
jest.mock("../utils/cloudinary", () => ({
  getViolationScreenshots: jest.fn(() => []),
  generateOptimizedScreenshotUrl: jest.fn(() => ""),
}));

// ── Routers under test ───────────────────────────────────────────────────────
const agentRouter = require("../routes/agentActivity");
const monitoringRouter = require("../routes/monitoring");

const app = express();
app.use(express.json());
app.use("/api/agent", agentRouter);
app.use("/api/monitoring", monitoringRouter);

// ── Helpers ──────────────────────────────────────────────────────────────────
function userQuery(result) {
  return {
    select: jest.fn().mockReturnValue({ lean: async () => result }),
  };
}

function consentQuery(result) {
  return { lean: async () => result };
}

function dayQuery(activeDay) {
  return { sort: jest.fn().mockResolvedValue(activeDay) };
}

function findChain(result) {
  const chain = {
    sort: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    select: jest.fn(() => chain),
    lean: jest.fn(async () => result),
  };
  return chain;
}

const ACTIVE_DAY = { _id: "day1", startDayTime: new Date(), date: new Date() };

function allowAllGates() {
  mockUserFindById.mockReturnValue(userQuery({ monitoringPaused: false }));
  mockConsentFindOne.mockReturnValue(consentQuery(null));
  mockAttendanceFindOne.mockReturnValue(dayQuery(ACTIVE_DAY));
  mockDailyFindOne.mockReturnValue(dayQuery(null));
}

const HUMAN_INTERVALS = Array.from({ length: 40 }, (_, i) => 130 + (i % 5) * 12);
const MASH_INTERVALS = Array.from({ length: 30 }, () => 40);

beforeEach(() => {
  jest.clearAllMocks();
  allowAllGates();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/agent/keystroke/ingest", () => {
  const basePayload = {
    attendanceId: "att1",
    activeApp: "Notepad",
    activeAppTitle: "notes.txt",
    segments: [
      {
        text: "Please review the quarterly report and share your feedback before Friday",
        keyCount: 70,
        backspaceCount: 3,
        pasteCount: 0,
        intervals: HUMAN_INTERVALS,
        start: new Date().toISOString(),
        durationMs: 9000,
      },
      {
        text: "asdfjkl;asdfjkl;qwertyuiop",
        keyCount: 26,
        backspaceCount: 0,
        pasteCount: 0,
        intervals: MASH_INTERVALS,
        start: new Date().toISOString(),
        durationMs: 1200,
      },
    ],
  };

  it("rejects payloads without an attendanceId", async () => {
    const res = await request(app)
      .post("/api/agent/keystroke/ingest")
      .send({ segments: basePayload.segments });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockInsertMany).not.toHaveBeenCalled();
  });

  it("blocks upload when monitoring is paused", async () => {
    mockUserFindById.mockReturnValue(userQuery({ monitoringPaused: true }));

    const res = await request(app)
      .post("/api/agent/keystroke/ingest")
      .send(basePayload);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("MONITORING_PAUSED");
    expect(mockInsertMany).not.toHaveBeenCalled();
  });

  it("blocks upload when consent is disabled", async () => {
    mockConsentFindOne.mockReturnValue(
      consentQuery({ monitoringEnabled: false, isActive: true })
    );

    const res = await request(app)
      .post("/api/agent/keystroke/ingest")
      .send(basePayload);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CONSENT_DENIED");
    expect(mockInsertMany).not.toHaveBeenCalled();
  });

  it("blocks upload when no workday is active", async () => {
    mockAttendanceFindOne.mockReturnValue(dayQuery(null));
    mockDailyFindOne.mockReturnValue(dayQuery(null));

    const res = await request(app)
      .post("/api/agent/keystroke/ingest")
      .send(basePayload);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("DAY_NOT_ACTIVE");
    expect(mockInsertMany).not.toHaveBeenCalled();
  });

  it("stores segments with server-side quality classification", async () => {
    mockInsertMany.mockResolvedValue([]);

    const res = await request(app)
      .post("/api/agent/keystroke/ingest")
      .send(basePayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.stored).toBe(2);
    expect(res.body.classifications).toEqual({ valuable: 1, key_mashing: 1 });

    expect(mockInsertMany).toHaveBeenCalledTimes(1);
    const docs = mockInsertMany.mock.calls[0][0];

    // Identity + session attribution come from the token / payload, not the agent.
    expect(docs[0].employee).toBe("emp1");
    expect(docs[0].session_id).toBe("att1");
    expect(docs[0].application_name).toBe("Notepad");

    expect(docs[0].quality.classification).toBe("valuable");
    expect(docs[0].quality.score).toBeGreaterThan(60);
    expect(docs[0].text).toContain("quarterly report");

    expect(docs[1].quality.classification).toBe("key_mashing");
    expect(docs[1].quality.score).toBeLessThanOrEqual(30);
  });

  it("caps oversized text and ignores empty noise segments", async () => {
    mockInsertMany.mockResolvedValue([]);

    const res = await request(app).post("/api/agent/keystroke/ingest").send({
      attendanceId: "att1",
      segments: [
        { text: "x".repeat(10000), keyCount: 10000, intervals: HUMAN_INTERVALS },
        { text: "", keyCount: 0 },
        null,
      ],
    });

    expect(res.status).toBe(200);
    const docs = mockInsertMany.mock.calls[0][0];
    expect(docs).toHaveLength(1);
    expect(docs[0].text.length).toBeLessThanOrEqual(4000);
  });

  it("handles an empty segments array gracefully", async () => {
    const res = await request(app)
      .post("/api/agent/keystroke/ingest")
      .send({ attendanceId: "att1", segments: [] });

    expect(res.status).toBe(400);
    expect(mockInsertMany).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/monitoring/employees/:id/keystrokes", () => {
  const fakeSegments = [
    {
      timestamp: new Date().toISOString(),
      text: "Please review the quarterly report before Friday",
      application_name: "Notepad",
      window_title: "notes.txt",
      capture: { char_count: 45, key_count: 48 },
      quality: { classification: "valuable", score: 84, reasons: ["Readable words at a human pace"] },
      wpm: 42,
      session_id: "att1",
    },
    {
      timestamp: new Date().toISOString(),
      text: "asdfjkl;asdfjkl;qwertyuiop",
      application_name: "Chrome",
      window_title: "",
      capture: { char_count: 24, key_count: 26 },
      quality: { classification: "key_mashing", score: 20, reasons: ["Almost no word-like tokens in the output"] },
      wpm: 0,
      session_id: "att1",
    },
  ];

  it("returns segments with a quality summary", async () => {
    mockKeystrokeFind.mockReturnValue(findChain(fakeSegments));

    const res = await request(app)
      .get("/api/monitoring/employees/emp1/keystrokes")
      .query({ date: "2026-11-16" });

    expect(res.status).toBe(200);
    expect(res.body.segments).toHaveLength(2);
    expect(res.body.summary).toMatchObject({
      total: 2,
      valuable: 1,
      key_mashing: 1,
      totalChars: 69,
    });
    expect(res.body.summary.avgWpm).toBe(21);
  });

  it("passes a classification filter into the query", async () => {
    mockKeystrokeFind.mockReturnValue(findChain([fakeSegments[1]]));

    const res = await request(app)
      .get("/api/monitoring/employees/emp1/keystrokes")
      .query({ classification: "key_mashing" });

    expect(res.status).toBe(200);
    const query = mockKeystrokeFind.mock.calls[0][0];
    expect(query["quality.classification"]).toBe("key_mashing");
    expect(res.body.summary.key_mashing).toBe(1);
  });

  it("rejects unknown classification values instead of passing them through", async () => {
    mockKeystrokeFind.mockReturnValue(findChain([]));

    const res = await request(app)
      .get("/api/monitoring/employees/emp1/keystrokes")
      .query({ classification: "DROP TABLE" });

    expect(res.status).toBe(200);
    const query = mockKeystrokeFind.mock.calls[0][0];
    expect(query["quality.classification"]).toBeUndefined();
  });
});
