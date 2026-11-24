/**
 * m1_identity_tenant_security.test.js
 *
 * Automated verification suite for Milestone 1:
 * 1. Tenant & Organization Model & Seed Logic (Feature 1)
 * 2. Canonical Immutable Employee Identity & Multi-Tenant Email Validation (Feature 2)
 * 3. Parikshak Builder Model Alignment & Identity Payload (Feature 3)
 * 4. Tenant Isolation in APIs & Task Ingestion (Feature 4)
 * 5. Security Hardening on Auth & Submissions (Feature 5)
 */

"use strict";

process.env.JWT_SECRET = "super-secret-m1-jwt-key-for-security-hardening-tests-only";
process.env.MONGODB_URI = "mongodb://localhost:27017/test";

const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const express = require("express");
const request = require("supertest");
const axios = require("axios");

// Components under test
const Tenant = require("../models/Tenant");
const User = require("../models/User");
const Task = require("../models/Task");
const Department = require("../models/Department");
const TaskSubmission = require("../models/TaskSubmission");
const Notification = require("../models/Notification");
const { formatEmployeeId, formatCanonicalEmployeeId } = require("../utils/employeeId");
const { isValidOrgEmail, orgEmailMongoFilter } = require("../utils/orgEmail");
const authMiddleware = require("../middleware/auth");
const { resolveActorTenant } = require("../middleware/tenantIsolation");
const { resolveTaskAssigneeAndDepartment } = require("../services/taskIngestionService");
const { invokeParikshak, submitTaskForReview } = require("../services/parikshakService");
const submissionRoutes = require("../routes/submission");
const userRoutes = require("../routes/users");

// Mock background telemetry to avoid unhandled DB writes during unit tests
jest.mock("../services/taskExecutionBridge", () => ({
  emitTaskAssignedEvent: jest.fn().mockResolvedValue({ traceId: "mock-trace" }),
  emitTaskSubmittedEvent: jest.fn().mockResolvedValue({ traceId: "mock-trace" }),
  emitTaskCompletedEvent: jest.fn().mockResolvedValue({ traceId: "mock-trace" }),
  emitTaskFailedEvent: jest.fn().mockResolvedValue({ traceId: "mock-trace" }),
  generateExecutionId: jest.fn().mockReturnValue("exec_mock_12345"),
}));

jest.mock("../services/karmaClient", () => ({
  signalTaskCompleted: jest.fn().mockResolvedValue({}),
}));

describe("Milestone 1 — Comprehensive Verification Suite", () => {
  beforeAll(() => {
    // Prevent Mongoose buffering timeout during offline unit tests
    mongoose.set("bufferCommands", false);
  });

  // ── 1. Tenant & Organization Model (Feature 1) ───────────────────────────
  describe("Feature 1: Tenant Model & Seeding", () => {
    it("exports DEFAULT_TENANTS containing ten-bhiv-core and ten-sips with correct domains", () => {
      const bhiv = Tenant.DEFAULT_TENANTS.find((t) => t.tenantId === "ten-bhiv-core");
      const sips = Tenant.DEFAULT_TENANTS.find((t) => t.tenantId === "ten-sips");

      expect(bhiv).toBeDefined();
      expect(bhiv.code).toBe("BHIV");
      expect(bhiv.allowedDomains).toContain("blackhole.ai");
      expect(bhiv.allowedDomains).toContain("gmail.com");

      expect(sips).toBeDefined();
      expect(sips.code).toBe("SIPS");
      expect(sips.allowedDomains).toContain("sips.edu");
      expect(sips.allowedDomains).toContain("sips.org");
    });

    it("seeds default tenants via Tenant.seedDefaultTenants without duplication", async () => {
      const mockFindOne = jest.spyOn(Tenant, "findOne");
      const mockCreate = jest.spyOn(Tenant, "create");

      // First run: tenants do not exist yet
      mockFindOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      mockCreate
        .mockResolvedValueOnce({ tenantId: "ten-bhiv-core", code: "BHIV" })
        .mockResolvedValueOnce({ tenantId: "ten-sips", code: "SIPS" });

      const seeded = await Tenant.seedDefaultTenants();
      expect(seeded).toHaveLength(2);
      expect(mockCreate).toHaveBeenCalledTimes(2);

      // Second run: tenants already exist (idempotent)
      mockFindOne
        .mockResolvedValueOnce({ tenantId: "ten-bhiv-core", code: "BHIV" })
        .mockResolvedValueOnce({ tenantId: "ten-sips", code: "SIPS" });

      const reseeded = await Tenant.seedDefaultTenants();
      expect(reseeded).toHaveLength(2);
      expect(mockCreate).toHaveBeenCalledTimes(2); // No extra calls

      mockFindOne.mockRestore();
      mockCreate.mockRestore();
    });

    it("enforces tenant isolation and rejects standard user switching tenant headers", () => {
      // Standard user from ten-bhiv-core attempts to spoof header for ten-sips
      const req = {
        user: { id: "user-1", role: "User", tenantId: "ten-bhiv-core" },
        headers: { "x-tenant-id": "ten-sips" },
      };
      const result = resolveActorTenant(req);
      expect(result).toEqual({
        mismatch: true,
        userTenant: "ten-bhiv-core",
        headerTenant: "ten-sips",
      });

      // Admin user is permitted to specify header
      const adminReq = {
        user: { id: "admin-1", role: "Admin", tenantId: "ten-bhiv-core" },
        headers: { "x-tenant-id": "ten-sips" },
      };
      expect(resolveActorTenant(adminReq)).toBe("ten-sips");
    });
  });

  // ── 2. Canonical Immutable Employee Identity (Feature 2) ──────────────────
  describe("Feature 2: Canonical Employee Identity & Multi-Tenant Validation", () => {
    it("formats standard EMP-<TENANT_CODE>-<ID> without forcing BHIV on other tenants", () => {
      // BHIV cases
      expect(formatEmployeeId("blackholeinfiverse80@gmail.com", null, "BHIV")).toBe("EMP-BHIV-080");
      expect(formatEmployeeId("bhivtest2@outlook.com", null, "BHIV")).toBe("EMP-BHIV-002");
      expect(formatEmployeeId("blackholeinfivers147@gmail.com", null, "BHIV")).toBe("EMP-BHIV-147");

      // SIPS cases (must NOT be prefixed with BHIV)
      expect(formatEmployeeId("student12@sips.edu", null, "SIPS")).toBe("EMP-SIPS-012");
      expect(formatEmployeeId("biotech005@sips.edu", null, "SIPS")).toBe("EMP-SIPS-005");
      expect(formatEmployeeId("sips099@sips.org", null, "SIPS")).toBe("EMP-SIPS-099");
    });

    it("distinguishes same-name employees from different organizations reliably", () => {
      // Two employees both named Shravani: one at BHIV, one at SIPS
      const shravaniBhiv = formatEmployeeId("blackholeinfiverse80@gmail.com", null, "BHIV");
      const shravaniSips = formatEmployeeId("shravani12@sips.edu", null, "SIPS");

      expect(shravaniBhiv).toBe("EMP-BHIV-080");
      expect(shravaniSips).toBe("EMP-SIPS-012");
      expect(shravaniBhiv).not.toBe(shravaniSips);
    });

    it("preserves already valid canonical employee IDs immutably", () => {
      const existing = "EMP-SIPS-042";
      expect(formatEmployeeId("newemail@sips.edu", existing, "SIPS")).toBe("EMP-SIPS-042");
      expect(formatEmployeeId("changedemail@gmail.com", "EMP-BHIV-100", "BHIV")).toBe("EMP-BHIV-100");
    });

    it("validates emails according to tenant allowed domains rather than hardcoded bhiv strings", () => {
      const sipsDomains = ["sips.edu", "sips.org", "gmail.com"];
      const bhivDomains = ["blackhole.ai", "localhost.invalid", "gmail.com", "outlook.com"];

      // SIPS candidate
      expect(isValidOrgEmail("student12@sips.edu", sipsDomains)).toBe(true);
      expect(isValidOrgEmail("researcher@sips.org", sipsDomains)).toBe(true);
      expect(isValidOrgEmail("student12@sips.edu", bhivDomains)).toBe(false);

      // BHIV candidate
      expect(isValidOrgEmail("dev@blackhole.ai", bhivDomains)).toBe(true);
      expect(isValidOrgEmail("test@unknown.com", bhivDomains)).toBe(false);
    });

    it("executes User pre-save hook to populate canonicalEmployeeId", () => {
      const user = new User({
        name: "Shravani SIPS",
        email: "shravani12@sips.edu",
        password: "hashedpassword123",
        organization: "SIPS",
        tenantId: "ten-sips",
      });

      // Find the pre-save hook registered on UserSchema
      const preHooks = User.schema.s.hooks._pres.get("save") || [];
      expect(preHooks.length).toBeGreaterThan(0);

      // Execute pre-save hook
      for (const hook of preHooks) {
        hook.fn.call(user, () => {});
      }

      expect(user.canonicalEmployeeId).toBe("EMP-SIPS-012");
      expect(user.employeeId).toBe("EMP-SIPS-012");
    });

    it("does NOT overwrite existing canonicalEmployeeId during pre-save", () => {
      const user = new User({
        name: "Shravani SIPS",
        email: "shravani12@sips.edu",
        password: "hashedpassword123",
        canonicalEmployeeId: "EMP-SIPS-999",
        organization: "SIPS",
        tenantId: "ten-sips",
      });

      const preHooks = User.schema.s.hooks._pres.get("save") || [];
      for (const hook of preHooks) {
        hook.fn.call(user, () => {});
      }

      // Must remain EMP-SIPS-999, never overwritten
      expect(user.canonicalEmployeeId).toBe("EMP-SIPS-999");
    });
  });

  // ── 3. Strict Auth Rejection & Backdoor Elimination (Feature 5) ────────────
  describe("Feature 5: Security Hardening on Auth Middleware", () => {
    let req, res, next;

    beforeEach(() => {
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      next = jest.fn();
    });

    it("authenticates valid token signed with JWT_SECRET", () => {
      const payload = { id: "usr-real-123", role: "User", email: "user@test.com" };
      const validToken = jwt.sign(payload, process.env.JWT_SECRET);

      req = {
        header: jest.fn((name) => {
          if (name === "x-auth-token") return validToken;
          return null;
        }),
      };

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe("usr-real-123");
      expect(res.status).not.toHaveBeenCalled();
    });

    it("strictly REJECTS forged unverified token and eliminates jwt.decode Admin backdoor", () => {
      // An attacker creates a token signed with a bogus secret or forged payload
      const forgedPayload = { id: "attacker-666", role: "Admin", name: "Hacker" };
      const forgedToken = jwt.sign(forgedPayload, "attacker-private-wrong-key");

      req = {
        header: jest.fn((name) => {
          if (name === "x-auth-token") return forgedToken;
          return null;
        }),
      };

      authMiddleware(req, res, next);

      // Must be rejected with 401 Unauthorized
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Token is not valid" });
      // Must NOT have assigned admin req.user
      expect(req.user).toBeUndefined();
    });

    it("rejects request when token is completely missing", () => {
      req = {
        header: jest.fn().mockReturnValue(null),
      };

      authMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "No token, authorization denied" });
    });
  });

  // ── 4. Task Ingestion Tenant Isolation & Fallback Removal (Feature 4) ─────
  describe("Feature 4: Task Ingestion Candidate Resolution", () => {
    let mockUserFindOne, mockDeptFindOne, mockDeptCreate;

    beforeEach(() => {
      mockUserFindOne = jest.spyOn(User, "findOne");
      mockDeptFindOne = jest.spyOn(Department, "findOne");
      mockDeptCreate = jest.spyOn(Department, "create");

      mockDeptFindOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: new mongoose.Types.ObjectId(), name: "Biotech" }),
      });
      mockDeptCreate.mockResolvedValue({ _id: new mongoose.Types.ObjectId(), name: "Biotech" });
    });

    afterEach(() => {
      mockUserFindOne.mockRestore();
      mockDeptFindOne.mockRestore();
      mockDeptCreate.mockRestore();
    });

    it("rejects ambiguous candidate hints without silently leaking to random non-admins", async () => {
      // Simulate that no user matches the candidate hint
      mockUserFindOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const resolution = await resolveTaskAssigneeAndDepartment(
        "Unknown Candidate",
        "Biotech",
        { tenantId: "ten-sips", organization: "SIPS" }
      );

      // Verify that findOne was queried with exact match conditions, NOT regex first-word
      expect(mockUserFindOne).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "ten-sips",
          $or: expect.arrayContaining([
            { canonicalEmployeeId: "Unknown Candidate" },
            { employeeId: "Unknown Candidate" },
            { email: "unknown candidate" },
            { username: "Unknown Candidate" },
          ]),
        })
      );

      // Crucial: assignee must be null and status set to 'Pending Admin Assignment'
      // It must NOT have fallen back to an arbitrary non-admin user
      expect(resolution.assignee).toBeNull();
      expect(resolution.assigneeUser).toBeNull();
      expect(resolution.status).toBe("Pending Admin Assignment");
    });

    it("resolves exact canonical employee ID within specified tenant", async () => {
      const matchedUser = {
        _id: new mongoose.Types.ObjectId(),
        canonicalEmployeeId: "EMP-SIPS-012",
        name: "Shravani",
        tenantId: "ten-sips",
      };

      mockUserFindOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(matchedUser),
      });

      const resolution = await resolveTaskAssigneeAndDepartment(
        "EMP-SIPS-012",
        "Biotech",
        { tenantId: "ten-sips", organization: "SIPS" }
      );

      expect(resolution.assignee).toEqual(matchedUser._id);
      expect(resolution.assigneeUser.canonicalEmployeeId).toBe("EMP-SIPS-012");
      expect(resolution.status).toBe("Pending");
    });

    it("allows unassigned tasks with status 'Pending Admin Assignment' to pass Mongoose validation", () => {
      const task = new Task({
        title: "Sample Unassigned Ingested Task",
        description: "Task without assignee awaiting admin assignment",
        department: new mongoose.Types.ObjectId(),
        dueDate: new Date(),
        status: "Pending Admin Assignment",
        assignee: null,
      });

      const validationError = task.validateSync();
      expect(validationError).toBeUndefined();

      // Conversely, regular task with status 'Pending' must require assignee
      const invalidTask = new Task({
        title: "Sample Incomplete Task",
        description: "Task without assignee but status is Pending",
        department: new mongoose.Types.ObjectId(),
        dueDate: new Date(),
        status: "Pending",
        assignee: null,
      });
      const invalidError = invalidTask.validateSync();
      expect(invalidError).toBeDefined();
      expect(invalidError.errors.assignee).toBeDefined();
    });
  });

  // ── 5. Parikshak Identity Payload Alignment (Feature 3) ───────────────────
  describe("Feature 3: Parikshak Complete Identity Payload", () => {
    let mockAxiosPost;
    let mockSubFindById;
    let mockTaskFindOne;
    let mockNotifCreate;

    beforeEach(() => {
      mockAxiosPost = jest.spyOn(axios, "post").mockResolvedValue({
        status: 200,
        data: {
          status: "PASS",
          score: 95,
          result: "PASS",
          review: "Verified clean codebase architecture and completed deliverables.",
        },
      });
      mockNotifCreate = jest.spyOn(Notification, "create").mockResolvedValue({});
    });

    afterEach(() => {
      mockAxiosPost.mockRestore();
      mockNotifCreate.mockRestore();
      if (mockSubFindById) mockSubFindById.mockRestore();
      if (mockTaskFindOne) mockTaskFindOne.mockRestore();
    });

    it("submitTaskForReview exports invokeParikshak and builds full identity object in outbound HTTP payload", async () => {
      expect(typeof submitTaskForReview).toBe("function");
      expect(submitTaskForReview).toBe(invokeParikshak);

      const userId = new mongoose.Types.ObjectId();
      const taskId = new mongoose.Types.ObjectId();
      const submissionId = new mongoose.Types.ObjectId();

      const user = {
        _id: userId,
        canonicalEmployeeId: "EMP-BHIV-080",
        name: "Aman Pal",
        email: "blackholeinfiverse80@gmail.com",
        tenantId: "ten-bhiv-core",
        organization: "BHIV",
        department: "AI ML",
      };

      const task = {
        _id: taskId,
        task_id: "T-GOV-001",
        title: "Feature 3 Integration",
        description: "Test task description",
        branch: "blackhole_mumbai",
        assignee: userId,
        department: new mongoose.Types.ObjectId(),
        status: "Submitted for Review",
        save: jest.fn().mockResolvedValue(true),
      };

      const submission = {
        _id: submissionId,
        task,
        user,
        notes: "Detailed implementation notes with verified identity",
        githubLink: "https://github.com/org/repo",
        documentLink: "",
        save: jest.fn().mockResolvedValue(true),
      };

      mockSubFindById = jest.spyOn(TaskSubmission, "findById").mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(submission),
        }),
      });

      mockTaskFindOne = jest.spyOn(Task, "findOne").mockResolvedValue(task);

      await submitTaskForReview(submissionId.toString(), "trace-feature3-test", null);

      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
      const [calledUrl, calledPayload] = mockAxiosPost.mock.calls[0];

      expect(calledPayload.submitted_by).toEqual({
        user_id: user._id.toString(),
        canonical_employee_id: "EMP-BHIV-080",
        name: "Aman Pal",
        email: "blackholeinfiverse80@gmail.com",
        tenant_id: "ten-bhiv-core",
        organization: "BHIV",
        department: "AI ML",
      });
      expect(calledPayload.canonical_employee_id).toBe("EMP-BHIV-080");
      expect(calledPayload.tenant_id).toBe("ten-bhiv-core");
      expect(calledPayload.trace_id).toBe("trace-feature3-test");
    });
  });

  // ── 6. Submission Route Security Hardening (Feature 5) ────────────────────
  describe("Feature 5: Submission Route Endpoint Protection", () => {
    let app;

    beforeAll(() => {
      app = express();
      app.use(express.json());
      app.use("/api/submission", submissionRoutes);
    });

    it("rejects unauthenticated submission requests with 401", async () => {
      const res = await request(app)
        .post("/api/submission")
        .send({ task: new mongoose.Types.ObjectId().toString(), notes: "Test notes" });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain("No token");
    });

    it("rejects non-admin attempting to submit with spoofed body userId (403)", async () => {
      const realUserId = new mongoose.Types.ObjectId();
      const victimUserId = new mongoose.Types.ObjectId();
      const token = jwt.sign({ id: realUserId.toString(), role: "User" }, process.env.JWT_SECRET);

      const res = await request(app)
        .post("/api/submission")
        .set("x-auth-token", token)
        .send({
          task: new mongoose.Types.ObjectId().toString(),
          userId: victimUserId.toString(), // Attacker attempts to spoof victim's ID
          notes: "Forged submission",
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Cannot submit work on behalf of another user");
    });

    it("rejects user submitting for a task assigned to someone else (403)", async () => {
      const realUserId = new mongoose.Types.ObjectId();
      const otherAssigneeId = new mongoose.Types.ObjectId();
      const taskId = new mongoose.Types.ObjectId();

      const token = jwt.sign({ id: realUserId.toString(), role: "User" }, process.env.JWT_SECRET);

      // Mock User lookup: active user
      jest.spyOn(User, "findOne").mockResolvedValueOnce({ _id: realUserId, stillExist: 1 });
      // Mock Task lookup: assigned to someone else
      jest.spyOn(Task, "findById").mockResolvedValueOnce({
        _id: taskId,
        assignee: otherAssigneeId,
        branch: "blackhole_mumbai",
      });

      const res = await request(app)
        .post("/api/submission")
        .set("x-auth-token", token)
        .send({
          task: taskId.toString(),
          notes: "Legitimate-looking work notes",
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("You are not assigned to this task");

      User.findOne.mockRestore();
      Task.findById.mockRestore();
    });
  });

  // ── 7. User Route Task Access Fail-Closed Authorization (Feature 5) ───────
  describe("Feature 5: User Tasks Route Fail-Closed Authorization", () => {
    let app;

    beforeAll(() => {
      app = express();
      app.use(express.json());
      app.use("/api/users", userRoutes);
    });

    it("rejects non-admin attempting to retrieve another user's tasks with 403", async () => {
      const userAId = new mongoose.Types.ObjectId();
      const userBId = new mongoose.Types.ObjectId();
      const token = jwt.sign({ id: userAId.toString(), role: "User" }, process.env.JWT_SECRET);

      const res = await request(app)
        .get(`/api/users/${userBId.toString()}/tasks`)
        .set("x-auth-token", token);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Not authorized to access these tasks");
    });

    it("allows user to retrieve their own tasks", async () => {
      const userAId = new mongoose.Types.ObjectId();
      const token = jwt.sign({ id: userAId.toString(), role: "User" }, process.env.JWT_SECRET);

      jest.spyOn(User, "findById").mockResolvedValueOnce({ _id: userAId, name: "User A" });
      jest.spyOn(Task, "find").mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([{ title: "My Task" }]),
              }),
            }),
          }),
        }),
      });

      const res = await request(app)
        .get(`/api/users/${userAId.toString()}/tasks`)
        .set("x-auth-token", token);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ title: "My Task" }]);

      User.findById.mockRestore();
      Task.find.mockRestore();
    });

    it("allows admin to retrieve any user's tasks", async () => {
      const adminId = new mongoose.Types.ObjectId();
      const targetUserId = new mongoose.Types.ObjectId();
      const adminToken = jwt.sign({ id: adminId.toString(), role: "Admin" }, process.env.JWT_SECRET);

      jest.spyOn(User, "findById").mockResolvedValueOnce({ _id: targetUserId, name: "Target User" });
      jest.spyOn(Task, "find").mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([{ title: "Target Task" }]),
              }),
            }),
          }),
        }),
      });

      const res = await request(app)
        .get(`/api/users/${targetUserId.toString()}/tasks`)
        .set("x-auth-token", adminToken);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ title: "Target Task" }]);

      User.findById.mockRestore();
      Task.find.mockRestore();
    });
  });
});
