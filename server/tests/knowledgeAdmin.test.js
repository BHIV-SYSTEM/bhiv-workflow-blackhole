/**
 * knowledgeAdmin.test.js
 *
 * Comprehensive Unit and Integration Test Suite for Milestone 3:
 * - Feature 12: Knowledge Admin Multi-Product Model & Storage
 * - Feature 13: Akash Sir's Governor Approval Workflow & Multi-Product Routes
 * - Feature 14: Knowledge Admin Multi-Product UI Contracts
 */

"use strict";

const mongoose = require("mongoose");
const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

const JWT_SECRET = process.env.JWT_SECRET || "blackhole-e2e-super-secret-key-2026";
process.env.JWT_SECRET = JWT_SECRET;

const ProductContext = require("../models/ProductContext");
const User = require("../models/User");
const Department = require("../models/Department");
const knowledgeAdminRoutes = require("../routes/knowledgeAdmin");
const { isGovernorCaller, incrementVersion } = knowledgeAdminRoutes;
const { migrateProductContexts, resolveUserForRecord } = require("../scripts/migrateProductContexts");

// Helper to create test JWT tokens
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

describe("Milestone 3: Knowledge Admin Multi-Product Support & Akash Sir Approval", () => {
  let app;
  let mongoUri;

  beforeAll(async () => {
    mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/niyantran";
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    }

    // Build Express application for testing routes
    app = express();
    app.use(express.json());
    // Mount on both paths for full backward compatibility & spec conformance
    app.use("/api/knowledge", knowledgeAdminRoutes);
    app.use("/api/knowledge-admin", knowledgeAdminRoutes);
  });

  afterAll(async () => {
    // Clean up test collections created during test run
    try {
      await ProductContext.deleteMany({
        $or: [
          { employeeId: /^EMP-TEST-/ },
          { employeeId: /^EMP-BHIV-POLY/ },
          { employeeId: /^EMP-BHIV-TEST/ },
          { employeeId: /^EMP-DUAL-/ },
          { employeeId: /^EMP-CORE-/ },
          { employeeId: "EMP-BHIV-080" }
        ]
      });
      await User.deleteMany({
        $or: [
          { email: /test-m3/ },
          { email: /polymath/ },
          { email: /isolation/ },
          { email: /other\.core/ },
          { canonicalEmployeeId: /^EMP-TEST-/ },
          { canonicalEmployeeId: /^EMP-DUAL-/ },
          { canonicalEmployeeId: /^EMP-CORE-/ }
        ]
      });
    } catch (e) {
      // Ignore cleanup error
    }
  });

  // =========================================================================
  // Feature 12: ProductContext Model & Storage Verification
  // =========================================================================
  describe("Feature 12: ProductContext Schema & Storage Integrity", () => {
    it("validates required fields: contextId, tenantId, employeeId, user, productId, content", async () => {
      const invalidDoc = new ProductContext({});
      const validationErr = invalidDoc.validateSync();

      expect(validationErr).toBeDefined();
      expect(validationErr.errors.employeeId).toBeDefined();
      expect(validationErr.errors.user).toBeDefined();
      expect(validationErr.errors.productId).toBeDefined();
      expect(validationErr.errors.content).toBeDefined();
    });

    it("applies default values: status='PENDING_APPROVAL', version='v1.0', tenantId='ten-bhiv-core'", async () => {
      const testUser = new mongoose.Types.ObjectId();
      const doc = new ProductContext({
        employeeId: "EMP-TEST-DEF-01",
        user: testUser,
        productId: "bhiv",
        productName: "BHIV OS",
        content: "Core architecture specification"
      });

      expect(doc.status).toBe("PENDING_APPROVAL");
      expect(doc.version).toBe("v1.0");
      expect(doc.tenantId).toBe("ten-bhiv-core");
      // Pre-validate hook uppercases productId and generates contextId
      await doc.validate();
      expect(doc.productId).toBe("BHIV");
      expect(doc.contextId).toMatch(/^CTX-/);
    });

    it("enforces compound uniqueness on { employeeId, productId, tenantId }", async () => {
      const testUser = new mongoose.Types.ObjectId();
      const empId = "EMP-TEST-UNIQ-01";
      const tenantId = "ten-bhiv-core";
      const productId = "NIYANTRAN";

      // Remove any leftover
      await ProductContext.deleteMany({ employeeId: empId, productId, tenantId });

      const doc1 = new ProductContext({
        contextId: `CTX-UNIQ-1-${Date.now()}`,
        employeeId: empId,
        tenantId,
        user: testUser,
        productId,
        productName: "Niyantran Engine",
        content: "Initial spec"
      });
      await doc1.save();

      // Duplicate insertion with same (employeeId, productId, tenantId) must throw code 11000
      const doc2 = new ProductContext({
        contextId: `CTX-UNIQ-2-${Date.now()}`,
        employeeId: empId,
        tenantId,
        user: testUser,
        productId,
        productName: "Niyantran Duplicate",
        content: "Conflicting duplicate spec"
      });

      let duplicateErr = null;
      try {
        await doc2.save();
      } catch (err) {
        duplicateErr = err;
      }

      expect(duplicateErr).toBeDefined();
      expect(duplicateErr.code).toBe(11000);

      // Clean up
      await ProductContext.deleteMany({ employeeId: empId, productId, tenantId });
    });

    it("supports multi-product creation for a single employee (2, 5, 10 products independently)", async () => {
      const testUser = new mongoose.Types.ObjectId();
      const empId = "EMP-TEST-POLY-10";
      const tenantId = "ten-bhiv-core";
      const products = [
        "BHIV", "NIYANTRAN", "PARIKSHAK", "TRINETRA", "TANTRA",
        "VAJRA", "SAMVAD", "UNIGURU", "DRISHTI", "PRAVESH"
      ];

      await ProductContext.deleteMany({ employeeId: empId, tenantId });

      // Create contexts for all 10 products for the SAME employee
      for (const prod of products) {
        const doc = new ProductContext({
          contextId: `CTX-${prod}-${Date.now()}`,
          employeeId: empId,
          tenantId,
          user: testUser,
          productId: prod,
          productName: `${prod} Platform Module`,
          content: `Authoritative grounding spec for ${prod} subsystem.`,
          status: "PENDING_APPROVAL"
        });
        await doc.save();
      }

      // Query back: all 10 independent products exist for this employee without overwriting
      const savedDocs = await ProductContext.find({ employeeId: empId, tenantId });
      expect(savedDocs.length).toBe(10);

      const savedProductIds = savedDocs.map(d => d.productId).sort();
      expect(savedProductIds).toEqual(products.slice().sort());

      // Clean up
      await ProductContext.deleteMany({ employeeId: empId, tenantId });
    });
  });

  // =========================================================================
  // Feature 12: Data Migration Script Verification
  // =========================================================================
  describe("Feature 12: migrateProductContexts Migration Script", () => {
    it("creates a timestamped safety backup of source file", () => {
      const testSource = path.resolve(__dirname, "../storage/injected_contexts.json");
      if (fs.existsSync(testSource)) {
        const { createBackup } = require("../scripts/migrateProductContexts");
        const backupPath = createBackup(testSource);
        expect(backupPath).toBeDefined();
        expect(fs.existsSync(backupPath)).toBe(true);

        // Remove temporary test backup
        fs.unlinkSync(backupPath);
      }
    });

    it("correctly migrates flat JSON contexts into ProductContext collection with APPROVED status and Akash signature", async () => {
      const summary = await migrateProductContexts({ dryRun: false });
      expect(summary.totalScanned).toBeGreaterThan(0);
      expect(summary.migrated).toBe(summary.totalScanned);
      expect(summary.skipped).toBe(0);

      // Verify that migrated records in DB have status: APPROVED and approvedBy: Akash
      const migratedDocs = await ProductContext.find({
        employeeId: { $in: ["BHIV157", "BHIV78", "BHIV-SEC-01", "BHIV-SEC-02", "BHIV-SEC-03", "BHIV-TST-01"] }
      });

      expect(migratedDocs.length).toBeGreaterThanOrEqual(6);
      migratedDocs.forEach(doc => {
        expect(doc.status).toBe("APPROVED");
        expect(doc.approvedBy).toBe("Akash");
        expect(doc.approvedAt).toBeDefined();
        expect(doc.versionHistory.length).toBeGreaterThanOrEqual(1);
        expect(doc.versionHistory[0].approvedBy).toBe("Akash");
      });
    });
  });

  // =========================================================================
  // Feature 13: Akash Sir's Governor Approval Workflow & Multi-Product APIs
  // =========================================================================
  describe("Feature 13: Governor Approval Workflow & Multi-Product Routes", () => {
    let devToken;
    let governorToken;
    let fakeAkashToken;
    let prakashToken;
    let testContextId;

    beforeAll(async () => {
      devToken = generateToken({
        name: "Dev Employee",
        email: "dev.employee@blackhole.ai",
        role: "User",
        canonicalEmployeeId: "EMP-TEST-DEV-01",
        tenantId: "ten-bhiv-core"
      });

      governorToken = generateToken({
        name: "Akash",
        email: "akash@blackhole.ai",
        role: "Governor",
        canonicalEmployeeId: "EMP-BHIV-GOV-01",
        tenantId: "ten-bhiv-core"
      });

      fakeAkashToken = generateToken({
        name: "Fake Akash",
        email: "fake.akash@sips.edu",
        role: "Intern",
        canonicalEmployeeId: "EMP-SIPS-999",
        tenantId: "ten-sips"
      });

      prakashToken = generateToken({
        name: "Prakash Sharma",
        email: "prakash@sips.edu",
        role: "Employee",
        canonicalEmployeeId: "EMP-SIPS-042",
        tenantId: "ten-sips"
      });
    });

    it("creates a product context with status PENDING_APPROVAL via POST /api/knowledge/contexts", async () => {
      const res = await request(app)
        .post("/api/knowledge/contexts")
        .set("Authorization", `Bearer ${devToken}`)
        .send({
          productId: "VAJRA",
          productName: "Vajra Trust Core",
          content: "Blockchain provenance and verification contracts spec v1.0",
          summary: "Vajra provenance spec"
        });

      expect(res.status).toBe(201);
      expect(res.body.productId).toBe("VAJRA");
      expect(res.body.status).toBe("PENDING_APPROVAL");
      expect(res.body.version).toBe("v1.0");
      expect(res.body.contextId).toMatch(/^CTX-/);

      testContextId = res.body.contextId;
    });

    it("prevents non-governor user from approving context (returns 403 Forbidden)", async () => {
      const res = await request(app)
        .post(`/api/knowledge/contexts/${testContextId}/approve`)
        .set("Authorization", `Bearer ${devToken}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.detail).toContain("Governor role required for context approval");
    });

    it("allows Governor (Akash) to approve context, setting status APPROVED and populating approvedBy/approvedAt", async () => {
      const res = await request(app)
        .post(`/api/knowledge/contexts/${testContextId}/approve`)
        .set("Authorization", `Bearer ${governorToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("SUCCESS");
      expect(res.body.context.status).toBe("APPROVED");
      expect(res.body.context.approvedBy).toBe("Akash");
      expect(res.body.context.approvedAt).toBeDefined();

      // Verify persistence in MongoDB
      const dbDoc = await ProductContext.findOne({ contextId: testContextId });
      expect(dbDoc.status).toBe("APPROVED");
      expect(dbDoc.approvedBy).toBe("Akash");
    });

    it("prevents non-governor from rejecting context (returns 403)", async () => {
      const res = await request(app)
        .post(`/api/knowledge/contexts/${testContextId}/reject`)
        .set("Authorization", `Bearer ${devToken}`)
        .send({ rejectionReason: "Unauthorized attempt" });

      expect(res.status).toBe(403);
      expect(res.body.detail).toContain("Governor role required for context rejection");
    });

    it("allows Governor to reject context with reason via POST /api/knowledge/contexts/:id/reject", async () => {
      const reason = "Specification lacks cryptographic signature verification details.";
      const res = await request(app)
        .post(`/api/knowledge/contexts/${testContextId}/reject`)
        .set("Authorization", `Bearer ${governorToken}`)
        .send({ rejectionReason: reason });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("REJECTED");
      expect(res.body.context.status).toBe("REJECTED");
      expect(res.body.context.rejectionReason).toBe(reason);

      // Verify in DB
      const dbDoc = await ProductContext.findOne({ contextId: testContextId });
      expect(dbDoc.status).toBe("REJECTED");
      expect(dbDoc.rejectionReason).toBe(reason);
    });

    it("strictly rejects spoofed user 'Fake Akash' (Intern) from approving or rejecting contexts (returns 403 Forbidden)", async () => {
      const approveRes = await request(app)
        .post(`/api/knowledge/contexts/${testContextId}/approve`)
        .set("Authorization", `Bearer ${fakeAkashToken}`)
        .send({});

      expect(approveRes.status).toBe(403);
      expect(approveRes.body.detail).toContain("Governor role required for context approval");

      const rejectRes = await request(app)
        .post(`/api/knowledge/contexts/${testContextId}/reject`)
        .set("Authorization", `Bearer ${fakeAkashToken}`)
        .send({ rejectionReason: "Spoofed intern attempt" });

      expect(rejectRes.status).toBe(403);
      expect(rejectRes.body.detail).toContain("Governor role required for context rejection");
    });

    it("strictly rejects user 'Prakash Sharma' (Employee) with substring 'akash' from approving or rejecting contexts (returns 403 Forbidden)", async () => {
      const approveRes = await request(app)
        .post(`/api/knowledge/contexts/${testContextId}/approve`)
        .set("Authorization", `Bearer ${prakashToken}`)
        .send({});

      expect(approveRes.status).toBe(403);
      expect(approveRes.body.detail).toContain("Governor role required for context approval");

      const rejectRes = await request(app)
        .post(`/api/knowledge/contexts/${testContextId}/reject`)
        .set("Authorization", `Bearer ${prakashToken}`)
        .send({ rejectionReason: "Employee attempt" });

      expect(rejectRes.status).toBe(403);
      expect(rejectRes.body.detail).toContain("Governor role required for context rejection");
    });

    it("isGovernorCaller helper enforces strict role, canonical ID, and corporate email without loose substring matching", () => {
      expect(isGovernorCaller(null)).toBe(false);
      expect(isGovernorCaller({})).toBe(false);
      expect(isGovernorCaller({ name: "Fake Akash", role: "Intern", email: "fake.akash@sips.edu" })).toBe(false);
      expect(isGovernorCaller({ name: "Prakash Sharma", role: "Employee", email: "prakash@sips.edu" })).toBe(false);
      expect(isGovernorCaller({ name: "Himanshu", role: "User", email: "himanshu@bhiv.com" })).toBe(false);
      expect(isGovernorCaller({ role: "Governor", name: "Any Gov" })).toBe(true);
      expect(isGovernorCaller({ role: "Admin", name: "Sys Admin" })).toBe(true);
      expect(isGovernorCaller({ canonicalEmployeeId: "EMP-BHIV-GOV-01" })).toBe(true);
      expect(isGovernorCaller({ canonicalEmployeeId: "USR-GOV-001" })).toBe(true);
      expect(isGovernorCaller({ email: "akash@blackhole.ai" })).toBe(true);
      expect(isGovernorCaller({ email: "ansh@blackhole.ai" })).toBe(true);
      expect(isGovernorCaller({ email: "governor@blackhole.ai" })).toBe(true);
    });

    it("editing an existing context advances version, pushes history, and resets status to PENDING_APPROVAL", async () => {
      // First re-approve it as Governor
      await request(app)
        .post(`/api/knowledge/contexts/${testContextId}/approve`)
        .set("Authorization", `Bearer ${governorToken}`);

      // Now developer submits an update
      const updateRes = await request(app)
        .put(`/api/knowledge/contexts/${testContextId}`)
        .set("Authorization", `Bearer ${devToken}`)
        .send({
          content: "Revised VAJRA spec with RS256 token signing and replay protection.",
          summary: "Revised VAJRA spec"
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.status).toBe("PENDING_APPROVAL");
      expect(updateRes.body.version).toBe("v1.1");
      expect(updateRes.body.content).toContain("Revised VAJRA spec");
      expect(updateRes.body.versionHistory.length).toBeGreaterThanOrEqual(1);

      // Verify in DB
      const dbDoc = await ProductContext.findOne({ contextId: testContextId });
      expect(dbDoc.status).toBe("PENDING_APPROVAL");
      expect(dbDoc.version).toBe("v1.1");
      expect(dbDoc.versionHistory.length).toBeGreaterThanOrEqual(1);
    });

    it("prevents submitting identical context if identical approved version already exists (returns 409 Conflict)", async () => {
      // Re-approve the current context
      await request(app)
        .post(`/api/knowledge/contexts/${testContextId}/approve`)
        .set("Authorization", `Bearer ${governorToken}`);

      // Attempt to submit identical content
      const dupRes = await request(app)
        .post("/api/knowledge/contexts")
        .set("Authorization", `Bearer ${devToken}`)
        .send({
          productId: "VAJRA",
          content: "Revised VAJRA spec with RS256 token signing and replay protection."
        });

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.detail).toContain("Identical approved context already exists");
    });

    it("lists contexts with pagination, search, and filtering via GET /api/knowledge/contexts", async () => {
      const res = await request(app)
        .get("/api/knowledge/contexts?productId=VAJRA&limit=5")
        .set("Authorization", `Bearer ${governorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toBeDefined();
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
      expect(res.body.page).toBe(1);
    });

    it("safely handles regex special characters in search query ([test, (probe), *) without crashing", async () => {
      const testQueries = ["[test", "(probe)", "*", "spec+", "{id}"];
      for (const q of testQueries) {
        const res = await request(app)
          .get(`/api/knowledge/contexts?search=${encodeURIComponent(q)}`)
          .set("Authorization", `Bearer ${governorToken}`);

        expect(res.status).toBe(200);
        expect(res.body.items).toBeDefined();
        expect(Array.isArray(res.body.items)).toBe(true);
      }
    });

    it("audits compliance with multi-product map without first-name collision via GET /api/knowledge/compliance", async () => {
      const res = await request(app)
        .get("/api/knowledge/compliance")
        .set("Authorization", `Bearer ${governorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("SUCCESS");
      expect(res.body.users).toBeDefined();
      expect(Array.isArray(res.body.users)).toBe(true);

      // Verify that every user record includes contextsByProduct
      res.body.users.forEach(u => {
        expect(u.contextsByProduct).toBeDefined();
        expect(typeof u.contextCount).toBe("number");
      });
    });

    it("increments semantic version properly (v1.0 -> v1.1, v1.9 -> v1.10, vNEXT-Build-10 -> vNEXT-Build-11)", () => {
      expect(incrementVersion("v1.0")).toBe("v1.1");
      expect(incrementVersion("v1.1")).toBe("v1.2");
      expect(incrementVersion("v1.9")).toBe("v1.10");
      expect(incrementVersion("vNEXT-Build-10")).toBe("vNEXT-Build-11");
    });
  });

  // =========================================================================
  // Multi-Tenant Isolation & Security Hardening Verification
  // =========================================================================
  describe("Multi-Tenant Isolation & Security Hardening", () => {
    const sharedEmpId = "EMP-DUAL-ISOLATION-001";
    const coreCanonicalId = "EMP-BHIV-DUAL-001";
    const sipsCanonicalId = "EMP-SIPS-DUAL-001";
    const otherCoreCanonicalId = "EMP-CORE-OTHER-99";
    let uCoreId, uSipsId, uOtherCoreId;
    let tCore, tSips, tOtherCore, govToken;
    let coreCtxId, sipsCtxId;

    beforeAll(async () => {
      uCoreId = new mongoose.Types.ObjectId();
      uSipsId = new mongoose.Types.ObjectId();
      uOtherCoreId = new mongoose.Types.ObjectId();

      govToken = generateToken({
        name: "Akash",
        email: "akash@blackhole.ai",
        role: "Governor",
        canonicalEmployeeId: "EMP-BHIV-GOV-01",
        tenantId: "ten-bhiv-core"
      });

      tCore = generateToken({
        id: uCoreId,
        canonicalEmployeeId: coreCanonicalId,
        employeeId: sharedEmpId,
        tenantId: "ten-bhiv-core",
        role: "User",
        email: "core.isolation@blackhole.ai"
      });

      tSips = generateToken({
        id: uSipsId,
        canonicalEmployeeId: sipsCanonicalId,
        employeeId: sharedEmpId,
        tenantId: "ten-sips",
        role: "Student",
        email: "sips.isolation@sips.edu"
      });

      tOtherCore = generateToken({
        id: uOtherCoreId,
        canonicalEmployeeId: otherCoreCanonicalId,
        employeeId: otherCoreCanonicalId,
        tenantId: "ten-bhiv-core",
        role: "User",
        email: "other.core@blackhole.ai"
      });

      // Create dual tenant users in DB for compliance test
      await User.deleteMany({
        $or: [
          { canonicalEmployeeId: coreCanonicalId },
          { canonicalEmployeeId: sipsCanonicalId },
          { canonicalEmployeeId: otherCoreCanonicalId },
          { email: "core.isolation@blackhole.ai" },
          { email: "sips.isolation@sips.edu" }
        ]
      });
      await User.create([
        {
          _id: uCoreId,
          name: "Core Dual User",
          email: "core.isolation@blackhole.ai",
          password: "hashed_test_password_123",
          canonicalEmployeeId: coreCanonicalId,
          employeeId: sharedEmpId,
          tenantId: "ten-bhiv-core",
          organization: "BHIV",
          role: "User",
          stillExist: 1
        },
        {
          _id: uSipsId,
          name: "SIPS Dual User",
          email: "sips.isolation@sips.edu",
          password: "hashed_test_password_123",
          canonicalEmployeeId: sipsCanonicalId,
          employeeId: sharedEmpId,
          tenantId: "ten-sips",
          organization: "SIPS",
          role: "User",
          stillExist: 1
        }
      ]);

      // Seed dual contexts with the same employeeId across different tenants
      await ProductContext.deleteMany({ employeeId: sharedEmpId });
      const ctx1 = await ProductContext.create({
        contextId: `CTX-CORE-${Date.now()}`,
        employeeId: sharedEmpId,
        productId: "BHIV-PROD-CORE",
        tenantId: "ten-bhiv-core",
        user: uCoreId,
        content: "Proprietary BHIV Core Context",
        status: "APPROVED"
      });
      coreCtxId = ctx1.contextId;

      const ctx2 = await ProductContext.create({
        contextId: `CTX-SIPS-${Date.now()}`,
        employeeId: sharedEmpId,
        productId: "SIPS-BIO-DRUG",
        tenantId: "ten-sips",
        user: uSipsId,
        content: "Confidential SIPS Biotech Drug Spec",
        status: "APPROVED"
      });
      sipsCtxId = ctx2.contextId;
    });

    afterAll(async () => {
      await ProductContext.deleteMany({
        $or: [
          { employeeId: sharedEmpId },
          { employeeId: otherCoreCanonicalId }
        ]
      });
      await User.deleteMany({
        $or: [
          { canonicalEmployeeId: coreCanonicalId },
          { canonicalEmployeeId: sipsCanonicalId },
          { canonicalEmployeeId: otherCoreCanonicalId }
        ]
      });
    });

    it("GET /my-contexts returns strictly contexts belonging to caller's tenantId, filtering out foreign tenant contexts with the same employeeId", async () => {
      const resCore = await request(app)
        .get("/api/knowledge/my-contexts")
        .set("Authorization", `Bearer ${tCore}`);

      expect(resCore.status).toBe(200);
      expect(resCore.body.status).toBe("SUCCESS");
      expect(resCore.body.count).toBe(1);
      expect(resCore.body.contexts.length).toBe(1);
      expect(resCore.body.contexts[0].contextId).toBe(coreCtxId);
      expect(resCore.body.contexts[0].tenantId).toBe("ten-bhiv-core");
      expect(resCore.body.contexts[0].productId).toBe("BHIV-PROD-CORE");

      const resSips = await request(app)
        .get("/api/knowledge/my-contexts")
        .set("Authorization", `Bearer ${tSips}`);

      expect(resSips.status).toBe(200);
      expect(resSips.body.status).toBe("SUCCESS");
      expect(resSips.body.count).toBe(1);
      expect(resSips.body.contexts.length).toBe(1);
      expect(resSips.body.contexts[0].contextId).toBe(sipsCtxId);
      expect(resSips.body.contexts[0].tenantId).toBe("ten-sips");
      expect(resSips.body.contexts[0].productId).toBe("SIPS-BIO-DRUG");
    });

    it("POST /contexts/:id/mark-outdated returns 403 Forbidden when called by a user from a different tenant", async () => {
      // SIPS user attempts to mark BHIV Core context as outdated
      const res = await request(app)
        .post(`/api/knowledge/contexts/${coreCtxId}/mark-outdated`)
        .set("Authorization", `Bearer ${tSips}`)
        .send({ reason: "Malicious cross-tenant attempt" });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Cross-tenant context access forbidden");

      // Verify that core context status remains APPROVED in DB
      const ctxCheck = await ProductContext.findOne({ contextId: coreCtxId });
      expect(ctxCheck.status).toBe("APPROVED");
    });

    it("POST /contexts/:id/mark-outdated returns 403 Forbidden when called by an unauthorized non-owner non-governor in same tenant", async () => {
      // Other BHIV core user attempts to mark sharedEmpId's context as outdated
      const res = await request(app)
        .post(`/api/knowledge/contexts/${coreCtxId}/mark-outdated`)
        .set("Authorization", `Bearer ${tOtherCore}`)
        .send({ reason: "Unauthorized attempt by peer" });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Unauthorized to mark this context outdated");

      // Verify that core context status remains APPROVED in DB
      const ctxCheck = await ProductContext.findOne({ contextId: coreCtxId });
      expect(ctxCheck.status).toBe("APPROVED");
    });

    it("POST /contexts/:id/mark-outdated allows context owner to mark their own context as OUTDATED", async () => {
      const res = await request(app)
        .post(`/api/knowledge/contexts/${coreCtxId}/mark-outdated`)
        .set("Authorization", `Bearer ${tCore}`)
        .send({ reason: "Superseded by internal architecture v2" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("OUTDATED");
      expect(res.body.outdatedReason).toBe("Superseded by internal architecture v2");

      const ctxCheck = await ProductContext.findOne({ contextId: coreCtxId });
      expect(ctxCheck.status).toBe("OUTDATED");
    });

    it("POST /contexts/:id/mark-outdated allows Governor to mark any context OUTDATED regardless of ownership", async () => {
      const res = await request(app)
        .post(`/api/knowledge/contexts/${sipsCtxId}/mark-outdated`)
        .set("Authorization", `Bearer ${govToken}`)
        .send({ reason: "Governor directive deprecation" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("OUTDATED");
      expect(res.body.outdatedReason).toBe("Governor directive deprecation");

      const ctxCheck = await ProductContext.findOne({ contextId: sipsCtxId });
      expect(ctxCheck.status).toBe("OUTDATED");
    });

    it("GET /compliance does not cross-contaminate contexts across tenants for same employee ID", async () => {
      // Re-seed contexts for clean test
      await ProductContext.deleteMany({ employeeId: sharedEmpId });
      await ProductContext.create([
        {
          contextId: `CTX-CORE-COMP-${Date.now()}`,
          employeeId: sharedEmpId,
          productId: "BHIV-AUDIT",
          tenantId: "ten-bhiv-core",
          user: uCoreId,
          content: "BHIV Audit Spec",
          status: "APPROVED"
        },
        {
          contextId: `CTX-SIPS-COMP-${Date.now()}`,
          employeeId: sharedEmpId,
          productId: "SIPS-BIO-AUDIT",
          tenantId: "ten-sips",
          user: uSipsId,
          content: "SIPS Bio Spec",
          status: "APPROVED"
        }
      ]);

      const res = await request(app)
        .get("/api/knowledge/compliance")
        .set("Authorization", `Bearer ${govToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("SUCCESS");

      const coreUserResult = res.body.users.find(u => u.canonicalEmployeeId === coreCanonicalId);
      const sipsUserResult = res.body.users.find(u => u.canonicalEmployeeId === sipsCanonicalId);

      expect(coreUserResult).toBeDefined();
      expect(sipsUserResult).toBeDefined();

      // Verify Core user has ONLY BHIV-AUDIT, NEVER SIPS-BIO-AUDIT
      expect(coreUserResult.contextsByProduct["BHIV-AUDIT"]).toBeDefined();
      expect(coreUserResult.contextsByProduct["SIPS-BIO-AUDIT"]).toBeUndefined();
      expect(coreUserResult.contexts.every(c => c.tenantId === "ten-bhiv-core")).toBe(true);

      // Verify SIPS user has ONLY SIPS-BIO-AUDIT, NEVER BHIV-AUDIT
      expect(sipsUserResult.contextsByProduct["SIPS-BIO-AUDIT"]).toBeDefined();
      expect(sipsUserResult.contextsByProduct["BHIV-AUDIT"]).toBeUndefined();
      expect(sipsUserResult.contexts.every(c => c.tenantId === "ten-sips")).toBe(true);
    });

    it("POST /quick-ingest prevents non-governor callers from specifying employeeId of another user", async () => {
      const res = await request(app)
        .post("/api/knowledge/quick-ingest")
        .set("Authorization", `Bearer ${tOtherCore}`)
        .send({
          employeeId: sharedEmpId,
          candidateName: "Spoofed Target",
          contextText: "Attempted unauthorized context insertion for another employee",
          productId: "SPOOF-PROD"
        });

      expect(res.status).toBe(200);
      // The resolved employee ID MUST be the caller's own canonicalEmployeeId, not the victim's
      expect(res.body.employee_id).toBe("EMP-CORE-OTHER-99");
      expect(res.body.injectedContext.employeeId).toBe("EMP-CORE-OTHER-99");
      expect(res.body.injectedContext.tenantId).toBe("ten-bhiv-core");

      // Verify in DB that no document was created for sharedEmpId under SPOOF-PROD
      const victimDoc = await ProductContext.findOne({ employeeId: sharedEmpId, productId: "SPOOF-PROD" });
      expect(victimDoc).toBeNull();
    });

    it("POST /ingest prevents non-governor callers from specifying individual_id of another user", async () => {
      const res = await request(app)
        .post("/api/knowledge/ingest")
        .set("Authorization", `Bearer ${tOtherCore}`)
        .send({
          individual_id: sharedEmpId,
          productId: "SPOOF-INGEST",
          content: "Attempted legacy ingest spoofing"
        });

      expect(res.status).toBe(200);
      expect(res.body.context.employeeId).toBe("EMP-CORE-OTHER-99");

      // Verify in DB that no document was created for sharedEmpId under SPOOF-INGEST
      const victimDoc = await ProductContext.findOne({ employeeId: sharedEmpId, productId: "SPOOF-INGEST" });
      expect(victimDoc).toBeNull();
    });
  });
});
