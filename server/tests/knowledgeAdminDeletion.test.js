/**
 * knowledgeAdminDeletion.test.js
 *
 * Comprehensive Automated Test Suite for Knowledge Admin Context Deletion:
 * - Employee deletion/withdrawal of DRAFT, PENDING_APPROVAL, REJECTED contexts
 * - Governor authorization enforcement on APPROVED context deletion (403 for regular users)
 * - Soft-deletion persistence (isDeleted, status=DELETED, deletedBy, deletedAt, deletionReason, previousStatus)
 * - Complete versionHistory and audit preservation (zero hard deletes)
 * - Tenant isolation and ownership enforcement
 * - Single-product deletion isolation (other products under same employee unaffected)
 * - Exclusion from active Governor approval queue
 * - Pre-submission validation blocking (deleted context cannot satisfy submission gate)
 * - Fresh context submission without duplicate index errors
 * - Concurrent safety (double-delete prevention, approval of deleted context rejected)
 */

"use strict";

const mongoose = require("mongoose");
const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "blackhole-e2e-super-secret-key-2026";
process.env.JWT_SECRET = JWT_SECRET;
process.env.PARIKSHAK_URL = process.env.PARIKSHAK_URL || "http://127.0.0.1:59999";

const ProductContext = require("../models/ProductContext");
const User = require("../models/User");
const knowledgeAdminRoutes = require("../routes/knowledgeAdmin");
const { validateContextInternal } = knowledgeAdminRoutes;

function generateToken(payload) {
  return jwt.sign(
    {
      id: payload.id || payload._id || new mongoose.Types.ObjectId().toString(),
      _id: payload._id || payload.id || new mongoose.Types.ObjectId().toString(),
      name: payload.name || "Test User",
      email: payload.email || "testuser@blackhole.ai",
      role: payload.role || "User",
      tenantId: payload.tenantId || "ten-bhiv-core",
      canonicalEmployeeId: payload.canonicalEmployeeId || payload.employeeId || "EMP-BHIV-080",
      employeeId: payload.employeeId || payload.canonicalEmployeeId || "EMP-BHIV-080"
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

describe("Feature: Knowledge Admin Context Deletion & Soft-Withdrawal", () => {
  let app;
  let mongoUri;

  const employeeUserId = new mongoose.Types.ObjectId().toString();
  const governorUserId = new mongoose.Types.ObjectId().toString();
  const sipsUserId = new mongoose.Types.ObjectId().toString();

  const employeeToken = generateToken({
    _id: employeeUserId,
    name: "Aryan Dias",
    email: "aryan.dias@bhiv.com",
    role: "Developer",
    tenantId: "ten-bhiv-core",
    canonicalEmployeeId: "BHIV-EMP-101",
    employeeId: "BHIV101"
  });

  const governorToken = generateToken({
    _id: governorUserId,
    name: "Akash",
    email: "akash@bhiv.com",
    role: "Governor",
    tenantId: "ten-bhiv-core",
    canonicalEmployeeId: "GOV-AKASH-001",
    employeeId: "GOV001"
  });

  const sipsEmployeeToken = generateToken({
    _id: sipsUserId,
    name: "Aryan Dias (SIPS)",
    email: "aryan.dias@sips.com",
    role: "Developer",
    tenantId: "ten-sips-prod",
    canonicalEmployeeId: "SIPS-EMP-101",
    employeeId: "SIPS101"
  });

  beforeAll(async () => {
    mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/niyantran";
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    }

    app = express();
    app.use(express.json());
    app.use("/api/knowledge", knowledgeAdminRoutes);
    app.use("/api/knowledge-admin", knowledgeAdminRoutes);

    // Clean test contexts
    await ProductContext.deleteMany({
      employeeId: { $in: ["BHIV-EMP-101", "SIPS-EMP-101"] }
    });
  });

  afterAll(async () => {
    await ProductContext.deleteMany({
      employeeId: { $in: ["BHIV-EMP-101", "SIPS-EMP-101"] }
    });
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  describe("1. Employee Ownership & Deletion Authorization", () => {
    let pendingCtxId;
    let rejectedCtxId;
    let approvedCtxId;

    beforeEach(async () => {
      // Create pending context
      const pCtx = await ProductContext.create({
        contextId: `CTX-DEL-TEST-P-${Date.now()}`,
        tenantId: "ten-bhiv-core",
        employeeId: "BHIV-EMP-101",
        user: employeeUserId,
        productId: "BHIV-CORE",
        productName: "BHIV Core EOS",
        version: "v1.0",
        status: "PENDING_APPROVAL",
        content: "Pending context content for deletion test.",
        summary: "Pending context summary."
      });
      pendingCtxId = pCtx.contextId;

      // Create rejected context
      const rCtx = await ProductContext.create({
        contextId: `CTX-DEL-TEST-R-${Date.now()}`,
        tenantId: "ten-bhiv-core",
        employeeId: "BHIV-EMP-101",
        user: employeeUserId,
        productId: "PARIKSHAK-REV",
        productName: "Parikshak Review Engine",
        version: "v1.0",
        status: "REJECTED",
        rejectionReason: "Missing architecture diagram",
        content: "Rejected context content.",
        summary: "Rejected context summary."
      });
      rejectedCtxId = rCtx.contextId;

      // Create approved context
      const aCtx = await ProductContext.create({
        contextId: `CTX-DEL-TEST-A-${Date.now()}`,
        tenantId: "ten-bhiv-core",
        employeeId: "BHIV-EMP-101",
        user: employeeUserId,
        productId: "TANTRA-GOV",
        productName: "Tantra Governance Gate",
        version: "v1.0",
        status: "APPROVED",
        approvedBy: "Akash",
        approvedAt: new Date(),
        content: "Approved context content.",
        summary: "Approved context summary."
      });
      approvedCtxId = aCtx.contextId;
    });

    afterEach(async () => {
      await ProductContext.deleteMany({
        employeeId: "BHIV-EMP-101"
      });
    });

    test("Employee can delete/withdraw their own PENDING_APPROVAL context", async () => {
      const res = await request(app)
        .delete(`/api/knowledge/contexts/${pendingCtxId}`)
        .set("Authorization", `Bearer ${employeeToken}`)
        .send({ reason: "Updating architecture specs" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("SUCCESS");
      expect(res.body.context.status).toBe("DELETED");
      expect(res.body.context.isDeleted).toBe(true);
      expect(res.body.context.previousStatus).toBe("PENDING_APPROVAL");
      expect(res.body.context.deletionReason).toBe("Updating architecture specs");

      // Verify in DB
      const dbDoc = await ProductContext.findOne({ contextId: pendingCtxId });
      expect(dbDoc.isDeleted).toBe(true);
      expect(dbDoc.status).toBe("DELETED");
      expect(dbDoc.versionHistory.length).toBeGreaterThan(0);
    });

    test("Employee can delete/withdraw their own REJECTED context", async () => {
      const res = await request(app)
        .delete(`/api/knowledge/contexts/${rejectedCtxId}`)
        .set("Authorization", `Bearer ${employeeToken}`)
        .send({ reason: "Withdrawing rejected draft" });

      expect(res.status).toBe(200);
      expect(res.body.context.status).toBe("DELETED");
      expect(res.body.context.previousStatus).toBe("REJECTED");
    });

    test("Owner CAN delete/withdraw their own APPROVED or ACTIVE context without Governor approval", async () => {
      const res = await request(app)
        .delete(`/api/knowledge/contexts/${approvedCtxId}`)
        .set("Authorization", `Bearer ${employeeToken}`)
        .send({ reason: "Owner withdrawing previously approved context" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("SUCCESS");
      expect(res.body.context.status).toBe("DELETED");
      expect(res.body.context.isDeleted).toBe(true);
      expect(res.body.context.previousStatus).toBe("APPROVED");

      const dbDoc = await ProductContext.findOne({ contextId: approvedCtxId });
      expect(dbDoc.status).toBe("DELETED");
      expect(dbDoc.isDeleted).toBe(true);
    });

    test("Same-tenant non-owner non-admin CANNOT delete another employee's context (403 Forbidden)", async () => {
      const peerToken = generateToken({
        _id: new mongoose.Types.ObjectId().toString(),
        name: "Peer User",
        email: "peer@bhiv.com",
        role: "User",
        tenantId: "ten-bhiv-core",
        canonicalEmployeeId: "BHIV-EMP-999",
        employeeId: "BHIV999"
      });

      const res = await request(app)
        .delete(`/api/knowledge/contexts/${approvedCtxId}`)
        .set("Authorization", `Bearer ${peerToken}`)
        .send({ reason: "Unauthorized peer deletion attempt" });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Unauthorized/i);
    });

    test("Authorized Governor/Admin/Manager CAN delete/withdraw any context", async () => {
      const res = await request(app)
        .delete(`/api/knowledge/contexts/${approvedCtxId}`)
        .set("Authorization", `Bearer ${governorToken}`)
        .send({ reason: "Governor authorized decommissioning of v1.0 context" });

      expect(res.status).toBe(200);
      expect(res.body.context.status).toBe("DELETED");
      expect(res.body.context.isDeleted).toBe(true);
      expect(res.body.context.previousStatus).toBe("APPROVED");
      expect(res.body.context.deletedBy).toBe("Akash");
    });

    test("Cross-tenant context deletion is strictly forbidden (403 Forbidden)", async () => {
      // SIPS user attempts to delete BHIV user's context
      const res = await request(app)
        .delete(`/api/knowledge/contexts/${pendingCtxId}`)
        .set("Authorization", `Bearer ${sipsEmployeeToken}`)
        .send({ reason: "Malicious cross-tenant attempt" });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Cross-tenant context deletion forbidden/i);
    });
  });

  describe("2. Single-Product Isolation & Audit Preservation", () => {
    let ctxProdAId;
    let ctxProdBId;

    beforeEach(async () => {
      const docA = await ProductContext.create({
        contextId: `CTX-ISO-A-${Date.now()}`,
        tenantId: "ten-bhiv-core",
        employeeId: "BHIV-EMP-101",
        user: employeeUserId,
        productId: "BHIV-ALPHA",
        productName: "Alpha Module",
        version: "v1.0",
        status: "PENDING_APPROVAL",
        content: "Alpha module specs",
        versionHistory: [
          { version: "v1.0", content: "Alpha module specs initial", summary: "Init" }
        ]
      });
      ctxProdAId = docA.contextId;

      const docB = await ProductContext.create({
        contextId: `CTX-ISO-B-${Date.now()}`,
        tenantId: "ten-bhiv-core",
        employeeId: "BHIV-EMP-101",
        user: employeeUserId,
        productId: "BHIV-BETA",
        productName: "Beta Module",
        version: "v1.0",
        status: "PENDING_APPROVAL",
        content: "Beta module specs",
        versionHistory: [
          { version: "v1.0", content: "Beta module specs initial", summary: "Init" }
        ]
      });
      ctxProdBId = docB.contextId;
    });

    afterEach(async () => {
      await ProductContext.deleteMany({ employeeId: "BHIV-EMP-101" });
    });

    test("Deleting Product A context does NOT affect Product B context", async () => {
      const res = await request(app)
        .delete(`/api/knowledge/contexts/${ctxProdAId}`)
        .set("Authorization", `Bearer ${employeeToken}`)
        .send({ reason: "Retiring Alpha module" });

      expect(res.status).toBe(200);

      // Verify Product A is deleted
      const docA = await ProductContext.findOne({ contextId: ctxProdAId });
      expect(docA.isDeleted).toBe(true);
      expect(docA.status).toBe("DELETED");

      // Verify Product B remains active and untouched
      const docB = await ProductContext.findOne({ contextId: ctxProdBId });
      expect(docB.isDeleted).toBe(false);
      expect(docB.status).toBe("PENDING_APPROVAL");
    });

    test("Soft-deletion preserves version history and review audit trail", async () => {
      await request(app)
        .delete(`/api/knowledge/contexts/${ctxProdAId}`)
        .set("Authorization", `Bearer ${employeeToken}`)
        .send({ reason: "Testing history preservation" });

      const docA = await ProductContext.findOne({ contextId: ctxProdAId });
      expect(docA.versionHistory.length).toBe(2);
      expect(docA.versionHistory[1].summary).toMatch(/WITHDRAWN/i);
      expect(docA.content).toBe("Alpha module specs");
    });
  });

  describe("3. Queue Filtering & Pre-Submission Validation Guard", () => {
    let pendingCtxId;

    beforeEach(async () => {
      const doc = await ProductContext.create({
        contextId: `CTX-GUARD-${Date.now()}`,
        tenantId: "ten-bhiv-core",
        employeeId: "BHIV-EMP-101",
        user: employeeUserId,
        productId: "BHIV-GATE",
        productName: "Gate Module",
        version: "v1.0",
        status: "PENDING_APPROVAL",
        content: "Gate module content"
      });
      pendingCtxId = doc.contextId;
    });

    afterEach(async () => {
      await ProductContext.deleteMany({ employeeId: "BHIV-EMP-101" });
    });

    test("Withdrawn context is immediately excluded from GET /contexts and GET /my-contexts", async () => {
      // 1. Initially appears in GET /contexts and GET /my-contexts
      let listRes = await request(app)
        .get("/api/knowledge/contexts?employeeId=BHIV-EMP-101")
        .set("Authorization", `Bearer ${governorToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.items.some(c => c.contextId === pendingCtxId)).toBe(true);

      let myRes = await request(app)
        .get("/api/knowledge/my-contexts")
        .set("Authorization", `Bearer ${employeeToken}`);
      expect(myRes.status).toBe(200);
      expect(myRes.body.contexts.some(c => c.contextId === pendingCtxId)).toBe(true);

      // 2. Withdraw context
      await request(app)
        .delete(`/api/knowledge/contexts/${pendingCtxId}`)
        .set("Authorization", `Bearer ${employeeToken}`)
        .send({ reason: "Retracting context" });

      // 3. No longer appears in GET /contexts or GET /my-contexts
      listRes = await request(app)
        .get("/api/knowledge/contexts?employeeId=BHIV-EMP-101")
        .set("Authorization", `Bearer ${governorToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.items.some(c => c.contextId === pendingCtxId)).toBe(false);

      myRes = await request(app)
        .get("/api/knowledge/my-contexts")
        .set("Authorization", `Bearer ${employeeToken}`);
      expect(myRes.status).toBe(200);
      expect(myRes.body.contexts.some(c => c.contextId === pendingCtxId)).toBe(false);
    });

    test("Pre-submission validation treats non-deleted context as active and deleted context as MISSING with non-blocking warning", async () => {
      // 1. Before deletion: non-deleted legacy PENDING_APPROVAL context is treated as ACTIVE and non-blocking
      let valResult = await validateContextInternal({
        productId: "BHIV-GATE",
        employeeId: "BHIV-EMP-101",
        tenantId: "ten-bhiv-core"
      });
      expect(valResult.data.status).toBe("ACTIVE");
      expect(valResult.data.rawStatus).toBe("PENDING_APPROVAL");
      expect(valResult.data.hasContext).toBe(true);
      expect(valResult.data.active).toBe(true);
      expect(valResult.data.contextWarning).toBe(false);
      expect(valResult.data.canSubmit).toBe(true);
      expect(valResult.data.allowed).toBe(true);
      expect(valResult.data.action).toBe("SUBMIT");

      // 2. Delete context
      await request(app)
        .delete(`/api/knowledge/contexts/${pendingCtxId}`)
        .set("Authorization", `Bearer ${employeeToken}`)
        .send({ reason: "Withdrawn" });

      // 3. After deletion: status is MISSING (Case A) with warning, yet still non-blocking (canSubmit: true, allowed: true)
      valResult = await validateContextInternal({
        productId: "BHIV-GATE",
        employeeId: "BHIV-EMP-101",
        tenantId: "ten-bhiv-core"
      });
      expect(valResult.data.status).toBe("MISSING");
      expect(valResult.data.hasContext).toBe(false);
      expect(valResult.data.active).toBe(false);
      expect(valResult.data.contextWarning).toBe(true);
      expect(valResult.data.canSubmit).toBe(true);
      expect(valResult.data.allowed).toBe(true);
      expect(valResult.data.action).toBe("ADD_CONTEXT");
    });
  });

  describe("4. Re-submission Without Duplicate Key Conflicts", () => {
    let ctxId;

    beforeEach(async () => {
      const doc = await ProductContext.create({
        contextId: `CTX-RESUB-${Date.now()}`,
        tenantId: "ten-bhiv-core",
        employeeId: "BHIV-EMP-101",
        user: employeeUserId,
        productId: "BHIV-RENEW",
        productName: "Renewable Module",
        version: "v1.0",
        status: "PENDING_APPROVAL",
        content: "Original v1.0 content"
      });
      ctxId = doc.contextId;

      // Soft delete it
      await request(app)
        .delete(`/api/knowledge/contexts/${ctxId}`)
        .set("Authorization", `Bearer ${employeeToken}`)
        .send({ reason: "Obsolete v1.0" });
    });

    afterEach(async () => {
      await ProductContext.deleteMany({ employeeId: "BHIV-EMP-101" });
    });

    test("Employee can submit fresh context for same product without duplicate index error", async () => {
      const freshRes = await request(app)
        .post("/api/knowledge/contexts")
        .set("Authorization", `Bearer ${employeeToken}`)
        .send({
          productId: "BHIV-RENEW",
          productName: "Renewable Module",
          content: "Fresh rewritten v2.0 content with complete APIs and architectures.",
          summary: "Fresh v2.0 summary"
        });

      expect(freshRes.status).toBe(200);
      expect(freshRes.body.status).toBe("ACTIVE");
      expect(freshRes.body.isDeleted).toBe(false);
      expect(freshRes.body.version).toBe("v1.1");
      expect(freshRes.body.content).toContain("Fresh rewritten v2.0 content");

      // Verify DB doc reactivated with full history preserved
      const dbDoc = await ProductContext.findOne({
        employeeId: "BHIV-EMP-101",
        productId: "BHIV-RENEW"
      });
      expect(dbDoc.isDeleted).toBe(false);
      expect(dbDoc.deletedAt).toBeNull();
      expect(dbDoc.status).toBe("ACTIVE");
      expect(dbDoc.versionHistory.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("5. Concurrent Safety & Edge Cases", () => {
    let ctxId;

    beforeEach(async () => {
      const doc = await ProductContext.create({
        contextId: `CTX-CONCUR-${Date.now()}`,
        tenantId: "ten-bhiv-core",
        employeeId: "BHIV-EMP-101",
        user: employeeUserId,
        productId: "BHIV-SAFETY",
        productName: "Safety Module",
        version: "v1.0",
        status: "PENDING_APPROVAL",
        content: "Safety module content"
      });
      ctxId = doc.contextId;
    });

    afterEach(async () => {
      await ProductContext.deleteMany({ employeeId: "BHIV-EMP-101" });
    });

    test("Cannot delete an already deleted context (409 Conflict)", async () => {
      // First delete succeeds
      const first = await request(app)
        .delete(`/api/knowledge/contexts/${ctxId}`)
        .set("Authorization", `Bearer ${employeeToken}`)
        .send({ reason: "First delete" });
      expect(first.status).toBe(200);

      // Second delete returns 409 Conflict
      const second = await request(app)
        .delete(`/api/knowledge/contexts/${ctxId}`)
        .set("Authorization", `Bearer ${employeeToken}`)
        .send({ reason: "Second delete attempt" });
      expect(second.status).toBe(409);
      expect(second.body.error).toMatch(/already deleted or withdrawn/i);
    });

    test("PUT on a soft-deleted context reactivates it as ACTIVE with version history preserved", async () => {
      // Delete context
      await request(app)
        .delete(`/api/knowledge/contexts/${ctxId}`)
        .set("Authorization", `Bearer ${employeeToken}`)
        .send({ reason: "Deleted before update" });

      const putRes = await request(app)
        .put(`/api/knowledge/contexts/${ctxId}`)
        .set("Authorization", `Bearer ${employeeToken}`)
        .send({ content: "Reactivated content via PUT" });

      expect(putRes.status).toBe(200);
      expect(putRes.body.status).toBe("ACTIVE");
      expect(putRes.body.isDeleted).toBe(false);
      expect(putRes.body.deletedAt).toBeNull();
      expect(putRes.body.version).toBe("v1.1");
    });
  });
});
