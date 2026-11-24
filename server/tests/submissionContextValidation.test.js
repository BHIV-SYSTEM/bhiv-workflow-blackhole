/**
 * submissionContextValidation.test.js
 *
 * Comprehensive Unit and Integration Test Suite for Milestone 4:
 * Feature 15: Pre-Submission Context Validation Flow & Submit Button Guards.
 *
 * Covers:
 * 1. Validation Endpoint: GET /api/knowledge/validate-context and POST /api/submissions/validate-context
 *    - Case A: Missing context (allowed: false, canSubmit: false, status: 'MISSING', action: 'ADD_CONTEXT')
 *    - Case B: Pending approval / draft context (allowed: false, canSubmit: false, status: 'PENDING_APPROVAL', action: 'AWAIT_APPROVAL')
 *    - Case C: Approved context (allowed: true, canSubmit: true, status: 'APPROVED', action: 'SUBMIT')
 *    - Case D: Outdated context (allowed: false, canSubmit: false, status: 'OUTDATED', action: 'UPDATE_CONTEXT', with reason)
 *    - Case D2: Rejected context (allowed: false, canSubmit: false, status: 'REJECTED', action: 'UPDATE_CONTEXT', with reason)
 *    - Parameter validation: Missing productId returns HTTP 400 Bad Request
 *    - Tenant boundary isolation: Context from ten-sips cannot satisfy ten-bhiv-core
 *    - Multi-product isolation: Approved context for TRINETRA does not satisfy BHIV
 *
 * 2. Submission Guards: POST /api/submissions and PUT /api/submissions/:id
 *    - Case A: Submission blocked with 400 Bad Request ("Product context is missing...")
 *    - Case B: Submission blocked with 400 Bad Request ("Product context is pending approval")
 *    - Case D: Submission blocked with 400 Bad Request ("Product context is outdated/rejected: <reason>")
 *    - Case D2: Submission blocked with 400 Bad Request ("Product context is outdated/rejected: <reason>")
 *    - Case C: Submission succeeds with 201 Created when context is APPROVED
 *    - Non-product administrative tasks are permitted without product context
 *    - Resubmission (PUT /api/submissions/:id) is blocked if context becomes outdated
 */

"use strict";

const mongoose = require("mongoose");
const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const JWT_SECRET = process.env.JWT_SECRET || "blackhole-e2e-super-secret-key-2026";
process.env.JWT_SECRET = JWT_SECRET;

const ProductContext = require("../models/ProductContext");
const User = require("../models/User");
const Task = require("../models/Task");
const TaskSubmission = require("../models/TaskSubmission");
const Department = require("../models/Department");
const knowledgeAdminRoutes = require("../routes/knowledgeAdmin");
const submissionRoutes = require("../routes/submission");

// Helper to generate valid JWTs
function generateToken(payload) {
  return jwt.sign(
    {
      id: payload.id || payload._id,
      _id: payload._id || payload.id,
      name: payload.name || "Test Developer",
      email: payload.email || "dev@blackhole.ai",
      role: payload.role || "User",
      tenantId: payload.tenantId || "ten-bhiv-core",
      canonicalEmployeeId: payload.canonicalEmployeeId || payload.employeeId || "EMP-BHIV-080",
      employeeId: payload.employeeId || payload.canonicalEmployeeId || "EMP-BHIV-080"
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

describe("Milestone 4: Pre-Submission Context Validation Flow & Submit Button Guards", () => {
  let app;
  let devUser;
  let devToken;
  let sipsUser;
  let sipsToken;
  let govUser;
  let govToken;
  let testDept;

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/niyantran";
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    }

    // Initialize express test app with both routes mounted
    app = express();
    app.use(express.json());
    app.use("/api/knowledge", knowledgeAdminRoutes);
    app.use("/api/submissions", submissionRoutes);

    // Setup Test Department
    testDept = await Department.findOne({ name: "Engineering Test M4" });
    if (!testDept) {
      testDept = await Department.create({
        name: "Engineering Test M4",
        description: "Department for M4 test suite"
      });
    }

    // Dev User (Aman Pal, ten-bhiv-core)
    devUser = await User.findOne({ email: "aman.dev.m4@blackhole.ai" });
    if (!devUser) {
      devUser = await User.create({
        name: "Aman Pal",
        email: "aman.dev.m4@blackhole.ai",
        password: "hashedpassword123",
        role: "User",
        department: testDept._id,
        tenantId: "ten-bhiv-core",
        canonicalEmployeeId: "EMP-M4-DEV-001",
        employeeId: "M4DEV001",
        stillExist: 1
      });
    }
    devToken = generateToken({
      id: devUser._id.toString(),
      name: devUser.name,
      email: devUser.email,
      role: devUser.role,
      tenantId: devUser.tenantId,
      canonicalEmployeeId: devUser.canonicalEmployeeId,
      employeeId: devUser.employeeId
    });

    // Governor User (Akash Sir, ten-bhiv-core)
    govUser = await User.findOne({ email: "akash.gov.m4@blackhole.ai" });
    if (!govUser) {
      govUser = await User.create({
        name: "Akash",
        email: "akash.gov.m4@blackhole.ai",
        password: "hashedpassword123",
        role: "Admin",
        tenantId: "ten-bhiv-core",
        canonicalEmployeeId: "EMP-M4-GOV-01",
        employeeId: "M4GOV001",
        stillExist: 1
      });
    }
    govToken = generateToken({
      id: govUser._id.toString(),
      name: govUser.name,
      email: govUser.email,
      role: govUser.role,
      tenantId: govUser.tenantId,
      canonicalEmployeeId: govUser.canonicalEmployeeId,
      employeeId: govUser.employeeId
    });

    // SIPS User (Shravani, ten-sips)
    sipsUser = await User.findOne({ email: "shravani.sips.m4@sips.edu" });
    if (!sipsUser) {
      sipsUser = await User.create({
        name: "Shravani Deshmukh",
        email: "shravani.sips.m4@sips.edu",
        password: "hashedpassword123",
        role: "User",
        department: testDept._id,
        tenantId: "ten-sips",
        canonicalEmployeeId: "EMP-M4-SIPS-001",
        employeeId: "M4SIPS001",
        stillExist: 1
      });
    }
    sipsToken = generateToken({
      id: sipsUser._id.toString(),
      name: sipsUser.name,
      email: sipsUser.email,
      role: sipsUser.role,
      tenantId: sipsUser.tenantId,
      canonicalEmployeeId: sipsUser.canonicalEmployeeId,
      employeeId: sipsUser.employeeId
    });
  });

  beforeEach(async () => {
    // Clear product contexts for test users before each test
    await ProductContext.deleteMany({
      $or: [
        { employeeId: "EMP-M4-DEV-001" },
        { employeeId: "M4DEV001" },
        { employeeId: "EMP-M4-SIPS-001" },
        { user: devUser._id }
      ]
    });
    // Clear submissions for dev user
    await TaskSubmission.deleteMany({ user: devUser._id });
  });

  afterAll(async () => {
    await ProductContext.deleteMany({
      $or: [
        { employeeId: "EMP-M4-DEV-001" },
        { employeeId: "M4DEV001" },
        { employeeId: "EMP-M4-SIPS-001" },
        { user: devUser._id }
      ]
    });
    await TaskSubmission.deleteMany({ user: devUser._id });
    await Task.deleteMany({ assignee: devUser._id });
    await User.deleteMany({
      email: { $in: ["aman.dev.m4@blackhole.ai", "akash.gov.m4@blackhole.ai", "shravani.sips.m4@sips.edu"] }
    });
    await Department.deleteMany({ _id: testDept._id });
  });

  // Helper to create task
  async function createTestTask({ title, product = "BHIV", tenantId = "ten-bhiv-core", assignee = devUser._id, task_id }) {
    const uniqueTaskId = task_id || `TASK-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    return await Task.create({
      title: title || `Test Task ${Date.now()}`,
      task_id: uniqueTaskId,
      description: "M4 Task Description",
      product,
      tenantId,
      assignee,
      department: testDept._id,
      dueDate: new Date(Date.now() + 86400000),
      status: "In Progress"
    });
  }

  // Helper to create product context
  async function createTestContext({
    productId = "BHIV",
    employeeId = "EMP-M4-DEV-001",
    tenantId = "ten-bhiv-core",
    user = devUser._id,
    status = "PENDING_APPROVAL",
    outdatedReason = null,
    rejectionReason = null,
    content = "Architecture specification content for test"
  }) {
    return await ProductContext.create({
      contextId: `CTX-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      tenantId,
      employeeId,
      user,
      productId: productId.toUpperCase(),
      productName: `${productId} Platform`,
      version: "v1.0",
      status,
      content,
      outdatedReason,
      rejectionReason,
      submittedAt: new Date()
    });
  }

  // =========================================================================
  // PART 1: VALIDATION ENDPOINT (GET /api/knowledge/validate-context)
  // =========================================================================

  describe("1. Pre-Submission Context Validation Endpoint (/validate-context)", () => {
    test("Case A: Returns status 'MISSING' and canSubmit=false when no context exists", async () => {
      const res = await request(app)
        .get("/api/knowledge/validate-context")
        .query({ productId: "BHIV" })
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("MISSING");
      expect(res.body.canSubmit).toBe(false);
      expect(res.body.allowed).toBe(false);
      expect(res.body.case).toBe("CASE_A");
      expect(res.body.action).toBe("ADD_CONTEXT");
      expect(res.body.message).toContain("Product context is missing. Please add and obtain approval");
      expect(res.body.context).toBeNull();
    });

    test("Case B: Returns status 'PENDING_APPROVAL' and canSubmit=false when context is pending approval", async () => {
      await createTestContext({
        productId: "BHIV",
        status: "PENDING_APPROVAL"
      });

      const res = await request(app)
        .get("/api/knowledge/validate-context")
        .query({ productId: "BHIV" })
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("PENDING_APPROVAL");
      expect(res.body.canSubmit).toBe(false);
      expect(res.body.allowed).toBe(false);
      expect(res.body.case).toBe("CASE_B");
      expect(res.body.action).toBe("AWAIT_APPROVAL");
      expect(res.body.message).toContain("Product context is pending approval");
      expect(res.body.context).not.toBeNull();
      expect(res.body.context.productId).toBe("BHIV");
    });

    test("Case B2: Returns status 'PENDING_APPROVAL' when context is in DRAFT", async () => {
      await createTestContext({
        productId: "BHIV",
        status: "DRAFT"
      });

      const res = await request(app)
        .get("/api/knowledge/validate-context")
        .query({ productId: "BHIV" })
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("PENDING_APPROVAL");
      expect(res.body.canSubmit).toBe(false);
      expect(res.body.allowed).toBe(false);
      expect(res.body.action).toBe("AWAIT_APPROVAL");
    });

    test("Case C: Returns status 'APPROVED' and canSubmit=true when context is approved", async () => {
      await createTestContext({
        productId: "BHIV",
        status: "APPROVED"
      });

      const res = await request(app)
        .get("/api/knowledge/validate-context")
        .query({ productId: "BHIV" })
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("APPROVED");
      expect(res.body.canSubmit).toBe(true);
      expect(res.body.allowed).toBe(true);
      expect(res.body.case).toBe("CASE_C");
      expect(res.body.action).toBe("SUBMIT");
      expect(res.body.message).toContain("Product context is approved");
      expect(res.body.context.status).toBe("APPROVED");
    });

    test("Case D: Returns status 'OUTDATED' and canSubmit=false with reason", async () => {
      await createTestContext({
        productId: "BHIV",
        status: "OUTDATED",
        outdatedReason: "Firmware upgraded to v2.5; v1.0 deprecated"
      });

      const res = await request(app)
        .get("/api/knowledge/validate-context")
        .query({ productId: "BHIV" })
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("OUTDATED");
      expect(res.body.canSubmit).toBe(false);
      expect(res.body.allowed).toBe(false);
      expect(res.body.case).toBe("CASE_D");
      expect(res.body.action).toBe("UPDATE_CONTEXT");
      expect(res.body.reason).toBe("Firmware upgraded to v2.5; v1.0 deprecated");
      expect(res.body.message).toContain("Firmware upgraded to v2.5; v1.0 deprecated");
    });

    test("Case D2: Returns status 'REJECTED' and canSubmit=false with rejection reason", async () => {
      await createTestContext({
        productId: "BHIV",
        status: "REJECTED",
        rejectionReason: "Incomplete threat correlation engine spec"
      });

      const res = await request(app)
        .get("/api/knowledge/validate-context")
        .query({ productId: "BHIV" })
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("REJECTED");
      expect(res.body.canSubmit).toBe(false);
      expect(res.body.allowed).toBe(false);
      expect(res.body.case).toBe("CASE_D");
      expect(res.body.action).toBe("UPDATE_CONTEXT");
      expect(res.body.reason).toBe("Incomplete threat correlation engine spec");
      expect(res.body.message).toContain("Incomplete threat correlation engine spec");
    });

    test("Rejects request with HTTP 400 when productId is missing", async () => {
      const res = await request(app)
        .get("/api/knowledge/validate-context")
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("productId query parameter is required");
    });

    test("Enforces multi-tenant isolation (SIPS context does not validate BHIV core user)", async () => {
      // Create approved context under ten-sips
      await createTestContext({
        productId: "BHIV",
        employeeId: "EMP-M4-SIPS-001",
        tenantId: "ten-sips",
        user: sipsUser._id,
        status: "APPROVED"
      });

      // Dev user (ten-bhiv-core) validates context
      const res = await request(app)
        .get("/api/knowledge/validate-context")
        .query({ productId: "BHIV" })
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("MISSING");
      expect(res.body.canSubmit).toBe(false);
    });

    test("Enforces product boundary isolation (TRINETRA approved context does not validate BHIV)", async () => {
      // Create approved context for TRINETRA
      await createTestContext({
        productId: "TRINETRA",
        status: "APPROVED"
      });

      // Query for BHIV
      const res = await request(app)
        .get("/api/knowledge/validate-context")
        .query({ productId: "BHIV" })
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("MISSING");
      expect(res.body.canSubmit).toBe(false);
    });

    test("Supports POST /api/submissions/validate-context matching e2e harness contract", async () => {
      const task = await createTestTask({ product: "BHIV" });

      const res = await request(app)
        .post("/api/submissions/validate-context")
        .send({ taskId: task._id.toString(), productId: "BHIV" })
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(200);
      expect(res.body.case).toBe("CASE_A");
      expect(res.body.allowed).toBe(false);
      expect(res.body.action).toBe("ADD_CONTEXT");
    });
  });

  // =========================================================================
  // PART 2: SUBMISSION GUARDS (POST /api/submissions)
  // =========================================================================

  describe("2. Backend Submission Guard (POST /api/submissions)", () => {
    test("Case A: Missing context returns HTTP 400 Bad Request and blocks submission", async () => {
      const task = await createTestTask({ product: "BHIV" });

      const res = await request(app)
        .post("/api/submissions")
        .send({
          task: task._id.toString(),
          githubLink: "https://github.com/bhiv/repo",
          notes: "Implementation notes for testing submission guard with no context at all"
        })
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe(
        "Product context is missing. Please add and obtain approval before submitting."
      );
      expect(res.body.code).toBe("MISSING_CONTEXT");
      expect(res.body.action).toBe("ADD_CONTEXT");

      // Verify no submission was persisted
      const sub = await TaskSubmission.findOne({ task: task._id });
      expect(sub).toBeNull();
    });

    test("Case B: Pending approval context returns HTTP 400 Bad Request and blocks submission", async () => {
      const task = await createTestTask({ product: "BHIV" });
      await createTestContext({ productId: "BHIV", status: "PENDING_APPROVAL" });

      const res = await request(app)
        .post("/api/submissions")
        .send({
          task: task._id.toString(),
          githubLink: "https://github.com/bhiv/repo",
          notes: "Implementation notes with pending context"
        })
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Product context is pending approval");
      expect(res.body.code).toBe("PENDING_APPROVAL");
      expect(res.body.action).toBe("AWAIT_APPROVAL");

      // Verify no submission was persisted
      const sub = await TaskSubmission.findOne({ task: task._id });
      expect(sub).toBeNull();
    });

    test("Case D: Outdated context returns HTTP 400 Bad Request and displays reason", async () => {
      const task = await createTestTask({ product: "BHIV" });
      await createTestContext({
        productId: "BHIV",
        status: "OUTDATED",
        outdatedReason: "API spec v1.0 deprecated for v2.0"
      });

      const res = await request(app)
        .post("/api/submissions")
        .send({
          task: task._id.toString(),
          githubLink: "https://github.com/bhiv/repo",
          notes: "Implementation notes with outdated context"
        })
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Product context is outdated/rejected: API spec v1.0 deprecated for v2.0");
      expect(res.body.code).toBe("OUTDATED");
      expect(res.body.action).toBe("UPDATE_CONTEXT");

      const sub = await TaskSubmission.findOne({ task: task._id });
      expect(sub).toBeNull();
    });

    test("Case D2: Rejected context returns HTTP 400 Bad Request and displays rejection reason", async () => {
      const task = await createTestTask({ product: "BHIV" });
      await createTestContext({
        productId: "BHIV",
        status: "REJECTED",
        rejectionReason: "Missing multi-tenant isolation proofs"
      });

      const res = await request(app)
        .post("/api/submissions")
        .send({
          task: task._id.toString(),
          githubLink: "https://github.com/bhiv/repo",
          notes: "Implementation notes with rejected context"
        })
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Product context is outdated/rejected: Missing multi-tenant isolation proofs");
      expect(res.body.code).toBe("REJECTED");
      expect(res.body.action).toBe("UPDATE_CONTEXT");

      const sub = await TaskSubmission.findOne({ task: task._id });
      expect(sub).toBeNull();
    });

    test("Case C: Approved context allows submission to proceed successfully with HTTP 201", async () => {
      const task = await createTestTask({ product: "BHIV" });
      await createTestContext({
        productId: "BHIV",
        status: "APPROVED"
      });

      const res = await request(app)
        .post("/api/submissions")
        .send({
          task: task._id.toString(),
          githubLink: "https://github.com/bhiv/repo",
          notes: "Comprehensive implementation notes describing complete feature delivery for approved context"
        })
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(201);
      expect(res.body.task.toString()).toBe(task._id.toString());

      // Verify submission was created in database
      const sub = await TaskSubmission.findOne({ task: task._id });
      expect(sub).not.toBeNull();
      expect(sub.githubLink).toBe("https://github.com/bhiv/repo");
    });

    test("Supports task lookup by task_id string (e.g. 'T-GOV-001')", async () => {
      const task = await Task.create({
        title: "T-GOV-001 Governance Task",
        task_id: "T-GOV-001",
        description: "Governance Task Description",
        product: "BHIV",
        tenantId: "ten-bhiv-core",
        assignee: devUser._id,
        department: testDept._id,
        dueDate: new Date(Date.now() + 86400000),
        status: "In Progress"
      });

      // When context is missing, it still catches the guard without CastError
      const res = await request(app)
        .post("/api/submissions")
        .send({
          taskId: "T-GOV-001",
          githubLink: "https://github.com/bhiv/repo"
        })
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe(
        "Product context is missing. Please add and obtain approval before submitting."
      );
    });

    test("Allows non-product administrative tasks to proceed without product context", async () => {
      const adminTask = await Task.create({
        title: "Internal Office Relocation Checklist",
        task_id: `TASK-ADMIN-${Date.now()}`,
        description: "Administrative task not tied to engineering product",
        product: "NONE",
        tenantId: "ten-bhiv-core",
        assignee: devUser._id,
        department: testDept._id,
        dueDate: new Date(Date.now() + 86400000),
        status: "In Progress"
      });

      const res = await request(app)
        .post("/api/submissions")
        .send({
          task: adminTask._id.toString(),
          githubLink: "https://github.com/admin/repo",
          notes: "Completed relocation planning without product context"
        })
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(201);
      const sub = await TaskSubmission.findOne({ task: adminTask._id });
      expect(sub).not.toBeNull();
    });

    test("Resubmission (PUT /api/submissions/:id) is blocked if context was marked OUTDATED", async () => {
      const task = await createTestTask({ product: "BHIV" });
      const ctx = await createTestContext({
        productId: "BHIV",
        status: "APPROVED"
      });

      // Submit initially with approved context
      const initialSub = await TaskSubmission.create({
        task: task._id,
        user: devUser._id,
        githubLink: "https://github.com/bhiv/repo",
        notes: "Initial submission",
        status: "Pending"
      });

      // Later, Governor marks context as OUTDATED
      ctx.status = "OUTDATED";
      ctx.outdatedReason = "Architecture updated to v2.0; previous context revoked";
      await ctx.save();

      // Attempt to resubmit / update submission
      const res = await request(app)
        .put(`/api/submissions/${initialSub._id}`)
        .send({
          githubLink: "https://github.com/bhiv/repo-v2",
          notes: "Attempted resubmission after context was marked outdated"
        })
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Product context is outdated/rejected: Architecture updated to v2.0");
      expect(res.body.code).toBe("OUTDATED");
    });

    test("Attempting to bypass BHIV context guard by passing productId: 'NONE' in body is rejected with HTTP 400", async () => {
      const task = await createTestTask({ product: "BHIV" });
      // Dev user has NO context for BHIV

      const res = await request(app)
        .post("/api/submissions")
        .send({
          task: task._id.toString(),
          productId: "NONE",
          githubLink: "https://github.com/bhiv/repo",
          notes: "Adversarial probe attempting to bypass guard with productId: NONE"
        })
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Product mismatch: Task belongs to 'BHIV', cannot submit under 'NONE'");

      const sub = await TaskSubmission.findOne({ task: task._id });
      expect(sub).toBeNull();
    });

    test("Attempting product substitution by passing productId: 'TRINETRA' on a BHIV task is rejected with HTTP 400", async () => {
      const task = await createTestTask({ product: "BHIV" });
      // Dev user has approved context for TRINETRA but none for BHIV
      await createTestContext({
        productId: "TRINETRA",
        status: "APPROVED"
      });

      const res = await request(app)
        .post("/api/submissions")
        .send({
          task: task._id.toString(),
          productId: "TRINETRA",
          githubLink: "https://github.com/bhiv/repo",
          notes: "Adversarial probe attempting product substitution with approved TRINETRA context"
        })
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Product mismatch: Task belongs to 'BHIV', cannot submit under 'TRINETRA'");

      const sub = await TaskSubmission.findOne({ task: task._id });
      expect(sub).toBeNull();
    });

    test("Attempting to bypass resubmission guard on PUT /api/submissions/:id by passing productId: 'NONE' is rejected with HTTP 400", async () => {
      const task = await createTestTask({ product: "BHIV" });
      const ctx = await createTestContext({
        productId: "BHIV",
        status: "APPROVED"
      });

      const initialSub = await TaskSubmission.create({
        task: task._id,
        user: devUser._id,
        githubLink: "https://github.com/bhiv/repo",
        notes: "Initial valid submission",
        status: "Pending"
      });

      // Context is marked outdated
      ctx.status = "OUTDATED";
      ctx.outdatedReason = "API spec deprecated";
      await ctx.save();

      const res = await request(app)
        .put(`/api/submissions/${initialSub._id}`)
        .send({
          productId: "NONE",
          githubLink: "https://github.com/bhiv/repo-v2",
          notes: "Adversarial probe attempting to bypass resubmission guard with productId: NONE"
        })
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Product mismatch: Task belongs to 'BHIV', cannot submit under 'NONE'");
    });

    test("Prioritizes rejectionReason over outdatedReason when context status is REJECTED", async () => {
      await createTestContext({
        productId: "BHIV",
        status: "REJECTED",
        rejectionReason: "Governor review rejected: Missing architecture compliance docs",
        outdatedReason: "Old deprecation reason that should not override rejection"
      });

      const res = await request(app)
        .get("/api/knowledge/validate-context")
        .query({ productId: "BHIV" })
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("REJECTED");
      expect(res.body.reason).toBe("Governor review rejected: Missing architecture compliance docs");
      expect(res.body.message).toContain("Governor review rejected: Missing architecture compliance docs");
    });
  });
});
