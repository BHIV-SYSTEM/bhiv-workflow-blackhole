/**
 * progressValidation.test.js
 *
 * Unit tests for Start Day missed-progress check/reason persistence and Aim Set reminder.
 */

"use strict";

const mockAttendanceFindOne = jest.fn();
const mockAttendanceFindByIdAndUpdate = jest.fn();
jest.mock("../models/Attendance", () => ({
  findOne: (...args) => mockAttendanceFindOne(...args),
  findByIdAndUpdate: (...args) => mockAttendanceFindByIdAndUpdate(...args),
}));

const mockDailyFindOne = jest.fn();
const mockDailyFindByIdAndUpdate = jest.fn();
jest.mock("../models/DailyAttendance", () => ({
  findOne: (...args) => mockDailyFindOne(...args),
  findByIdAndUpdate: (...args) => mockDailyFindByIdAndUpdate(...args),
}));

const mockProgressFind = jest.fn();
jest.mock("../models/Progress", () => ({
  find: (...args) => mockProgressFind(...args),
}));

const mockAimFindOne = jest.fn();
jest.mock("../models/Aim", () => ({
  findOne: (...args) => mockAimFindOne(...args),
}));

const {
  checkPreviousDayMissingProgress,
  validateAndRecordMissedProgressReason,
  checkTodayAimStatus,
} = require("../utils/progressValidation");

const makeSortChain = (result) => ({
  sort: jest.fn().mockResolvedValue(result),
});

describe("progressValidation Start Day checks & Aim reminder", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAttendanceFindByIdAndUpdate.mockResolvedValue({});
    mockDailyFindByIdAndUpdate.mockResolvedValue({});
  });

  it("allows first-time user with no prior worked attendance record", async () => {
    mockAttendanceFindOne.mockReturnValue(makeSortChain(null));
    mockDailyFindOne.mockReturnValue(makeSortChain(null));

    const res = await checkPreviousDayMissingProgress("user1", new Date("2026-11-17T04:00:00Z"));
    expect(res.missing).toBe(false);
    expect(res.reasonRequired).toBe(false);
  });

  it("flags missing previous day progress when prior worked session has no Progress doc", async () => {
    const yesterdayStart = new Date("2026-11-16T04:00:00Z");
    mockAttendanceFindOne.mockReturnValue(
      makeSortChain({ _id: "att1", startDayTime: yesterdayStart, date: new Date("2026-11-16T00:00:00Z") })
    );
    mockDailyFindOne.mockReturnValue(
      makeSortChain({ _id: "daily1", startDayTime: yesterdayStart, date: new Date("2026-11-16T00:00:00Z") })
    );
    mockProgressFind.mockReturnValue(makeSortChain([]));

    const res = await checkPreviousDayMissingProgress("user1", new Date("2026-11-17T04:00:00Z"));
    expect(res.missing).toBe(true);
    expect(res.reasonRequired).toBe(true);
    expect(res.previousDateLabel).toBe("16 Nov 2026");
  });

  it("skips prompt if previous day already had meaningful progress", async () => {
    const yesterdayStart = new Date("2026-11-16T04:00:00Z");
    mockAttendanceFindOne.mockReturnValue(
      makeSortChain({ _id: "att1", startDayTime: yesterdayStart })
    );
    mockDailyFindOne.mockReturnValue(makeSortChain(null));
    mockProgressFind.mockReturnValue(
      makeSortChain([{ notes: "Implemented Start Day workflow update", progressPercentage: 80 }])
    );

    const res = await checkPreviousDayMissingProgress("user1", new Date("2026-11-17T04:00:00Z"));
    expect(res.missing).toBe(false);
  });

  it("rejects short reason and persists valid reason across Attendance & DailyAttendance", async () => {
    const yesterdayStart = new Date("2026-11-16T04:00:00Z");
    mockAttendanceFindOne.mockReturnValue(
      makeSortChain({ _id: "att1", startDayTime: yesterdayStart })
    );
    mockDailyFindOne.mockReturnValue(
      makeSortChain({ _id: "daily1", startDayTime: yesterdayStart })
    );
    mockProgressFind.mockReturnValue(makeSortChain([]));

    const failRes = await validateAndRecordMissedProgressReason({
      userId: "user1",
      reason: "short",
      now: new Date("2026-11-17T04:00:00Z"),
    });
    expect(failRes.ok).toBe(false);
    expect(failRes.code).toBe("PREVIOUS_DAY_PROGRESS_REASON_REQUIRED");
    expect(mockAttendanceFindByIdAndUpdate).not.toHaveBeenCalled();

    const okRes = await validateAndRecordMissedProgressReason({
      userId: "user1",
      reason: "Internet outage in evening before logging daily notes",
      now: new Date("2026-11-17T04:00:00Z"),
    });
    expect(okRes.ok).toBe(true);
    expect(okRes.recordedReason).toContain("Internet outage");
    expect(mockAttendanceFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(mockDailyFindByIdAndUpdate).toHaveBeenCalledTimes(1);
  });

  it("returns aimReminder=true when today Aim is unset and false when set", async () => {
    mockAimFindOne.mockReturnValue(makeSortChain(null));
    const unset = await checkTodayAimStatus("user1", new Date("2026-11-17T04:00:00Z"));
    expect(unset.hasAimToday).toBe(false);
    expect(unset.aimReminder).toBe(true);

    mockAimFindOne.mockReturnValue(makeSortChain({ aims: "Complete API integration tests" }));
    const set = await checkTodayAimStatus("user1", new Date("2026-11-17T04:00:00Z"));
    expect(set.hasAimToday).toBe(true);
    expect(set.aimReminder).toBe(false);
  });
});

