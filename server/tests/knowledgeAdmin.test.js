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
process.env.PARIKSHAK_URL = process.env.PARIKSHAK_URL || "http://127.0.0.1:59999";

const ProductContext = require("../models/ProductContext");
const User = require("../models/User");
const Department = require("../models/Department");
const Task = require("../models/Task");
const TaskSubmission = require("../models/TaskSubmission");
const knowledgeAdminRoutes = require("../routes/knowledgeAdmin");
const authRoutes = require("../routes/auth");
const praveshRoutes = require("../routes/pravesh");
const taskRoutes = require("../routes/tasks");
const userRoutes = require("../routes/users");
const taskIngestionRoutes = require("../routes/taskIngestion");
const { generateCanonicalTaskPacket } = require("../services/taskIngestionService");
const { isGovernorCaller, isAdminCaller, incrementVersion, validateContextInternal } = knowledgeAdminRoutes;
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
    app.use("/api/auth", authRoutes);
    app.use("/api/pravesh", praveshRoutes);
    app.use("/api/tasks/ingest", taskIngestionRoutes);
    app.use("/api/tasks", taskRoutes);
    app.use("/api/users", userRoutes);
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
          { employeeId: /^EMP-M1-/ },
          { employeeId: /^EMP-PAG-/ },
          { employeeId: "EMP-BHIV-080" }
        ]
      });
      await User.deleteMany({
        $or: [
          { email: /test-m3/ },
          { email: /polymath/ },
          { email: /isolation/ },
          { email: /other\.core/ },
          { email: /m1\.test/ },
          { canonicalEmployeeId: /^EMP-TEST-/ },
          { canonicalEmployeeId: /^EMP-DUAL-/ },
          { canonicalEmployeeId: /^EMP-CORE-/ },
          { canonicalEmployeeId: /^EMP-M1-/ }
        ]
      });
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
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

    it("applies default values: status='ACTIVE', version='v1.0', tenantId='ten-bhiv-core'", async () => {
      const testUser = new mongoose.Types.ObjectId();
      const doc = new ProductContext({
        employeeId: "EMP-TEST-DEF-01",
        user: testUser,
        productId: "bhiv",
        productName: "BHIV OS",
        content: "Core architecture specification"
      });

      expect(doc.status).toBe("ACTIVE");
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
  // Feature 13 (R2/F4): Direct Knowledge CRUD & Multi-Product APIs (No Approval)
  // =========================================================================
  describe("Feature 13: Direct Knowledge CRUD & Multi-Product Routes (No Approval Gating)", () => {
    let devToken;
    let governorToken;
    let managerToken;
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

      managerToken = generateToken({
        name: "Manager User",
        email: "manager.m1@blackhole.ai",
        role: "Manager",
        canonicalEmployeeId: "EMP-TEST-MGR-01",
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

    it("creates a product context immediately with status ACTIVE via POST /api/knowledge/contexts", async () => {
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
      expect(res.body.status).toBe("ACTIVE");
      expect(res.body.version).toBe("v1.0");
      expect(res.body.contextId).toMatch(/^CTX-/);

      testContextId = res.body.contextId;
    });

    it("removes Governor approval queue, approve, and reject routes completely", async () => {
      const queueRes = await request(app)
        .get("/api/knowledge/contexts/pending-approval")
        .set("Authorization", `Bearer ${governorToken}`);
      // Either 404 or treated as :id lookup returning 404 Context not found (no pending-approval route)
      expect(queueRes.status).toBe(404);

      const approveRes = await request(app)
        .post(`/api/knowledge/contexts/${testContextId}/approve`)
        .set("Authorization", `Bearer ${governorToken}`)
        .send({});
      expect(approveRes.status).toBe(404);

      const approveAliasRes = await request(app)
        .post(`/api/knowledge/approvals/${testContextId}/approve`)
        .set("Authorization", `Bearer ${governorToken}`)
        .send({});
      expect(approveAliasRes.status).toBe(404);

      const rejectRes = await request(app)
        .post(`/api/knowledge/contexts/${testContextId}/reject`)
        .set("Authorization", `Bearer ${governorToken}`)
        .send({ rejectionReason: "Deprecated" });
      expect(rejectRes.status).toBe(404);

      const rejectAliasRes = await request(app)
        .post(`/api/knowledge/approvals/${testContextId}/reject`)
        .set("Authorization", `Bearer ${governorToken}`)
        .send({ rejectionReason: "Deprecated" });
      expect(rejectAliasRes.status).toBe(404);
    });

    it("isGovernorCaller and isAdminCaller enforce strict roles without loose substring matching", () => {
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

      // isAdminCaller aligns with KnowledgeAdmin.jsx (Governor, Admin, Manager)
      expect(isAdminCaller({ role: "Manager", name: "Mgr" })).toBe(true);
      expect(isAdminCaller({ role: "Admin", name: "Adm" })).toBe(true);
      expect(isAdminCaller({ role: "Governor", name: "Gov" })).toBe(true);
      expect(isAdminCaller({ role: "User", name: "Usr" })).toBe(false);
      expect(isAdminCaller({ role: "Intern", name: "Fake Akash", email: "fake.akash@sips.edu" })).toBe(false);
    });

    it("editing an existing context advances version, pushes history, and keeps status ACTIVE", async () => {
      const updateRes = await request(app)
        .put(`/api/knowledge/contexts/${testContextId}`)
        .set("Authorization", `Bearer ${devToken}`)
        .send({
          content: "Revised VAJRA spec with RS256 token signing and replay protection.",
          summary: "Revised VAJRA spec"
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.status).toBe("ACTIVE");
      expect(updateRes.body.version).toBe("v1.1");
      expect(updateRes.body.content).toContain("Revised VAJRA spec");
      expect(updateRes.body.versionHistory.length).toBeGreaterThanOrEqual(1);

      const dbDoc = await ProductContext.findOne({ contextId: testContextId });
      expect(dbDoc.status).toBe("ACTIVE");
      expect(dbDoc.version).toBe("v1.1");
      expect(dbDoc.versionHistory.length).toBeGreaterThanOrEqual(1);
    });

    it("updates Product ID directly and rejects a duplicate employee/product context", async () => {
      const employeeId = `EMP-TEST-PRODUCT-UPDATE-${Date.now()}`;
      const userId = new mongoose.Types.ObjectId();
      const context = await ProductContext.create({
        contextId: `CTX-TEST-PRODUCT-UPDATE-${Date.now()}`,
        employeeId,
        tenantId: "ten-bhiv-core",
        user: userId,
        productId: "OLD-PRODUCT",
        content: "Initial context"
      });
      const conflictingContext = await ProductContext.create({
        contextId: `CTX-TEST-PRODUCT-CONFLICT-${Date.now()}`,
        employeeId,
        tenantId: "ten-bhiv-core",
        user: userId,
        productId: "TAKEN-PRODUCT",
        content: "Existing product context"
      });

      const updateRes = await request(app)
        .put(`/api/knowledge/contexts/${context.contextId}`)
        .set("Authorization", `Bearer ${governorToken}`)
        .send({ productId: "new-product" });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.productId).toBe("NEW-PRODUCT");
      expect(updateRes.body.status).toBe("ACTIVE");

      const conflictRes = await request(app)
        .put(`/api/knowledge/contexts/${context.contextId}`)
        .set("Authorization", `Bearer ${governorToken}`)
        .send({ productId: conflictingContext.productId });

      expect(conflictRes.status).toBe(409);
      await ProductContext.deleteMany({ employeeId });
    });

    it("re-submitting via POST /contexts updates directly to ACTIVE without 409 duplicate blocking", async () => {
      const dupRes = await request(app)
        .post("/api/knowledge/contexts")
        .set("Authorization", `Bearer ${devToken}`)
        .send({
          productId: "VAJRA",
          content: "Revised VAJRA spec with RS256 token signing and replay protection."
        });

      expect(dupRes.status).toBe(200);
      expect(dupRes.body.status).toBe("ACTIVE");
      expect(dupRes.body.version).toBe("v1.2");
    });

    it("validate-context treats all non-deleted statuses (ACTIVE, APPROVED, PENDING_APPROVAL, REJECTED, DRAFT, OUTDATED) as active and never blocks", async () => {
      const statusesToTest = ["ACTIVE", "APPROVED", "PENDING_APPROVAL", "REJECTED", "DRAFT", "OUTDATED"];
      for (const st of statusesToTest) {
        await ProductContext.updateOne({ contextId: testContextId }, { $set: { status: st, isDeleted: false } });
        const valRes = await request(app)
          .get("/api/knowledge/validate-context?productId=VAJRA")
          .set("Authorization", `Bearer ${devToken}`);

        expect(valRes.status).toBe(200);
        expect(valRes.body.canSubmit).toBe(true);
        expect(valRes.body.allowed).toBe(true);
        expect(valRes.body.hasContext).toBe(true);
        expect(valRes.body.active).toBe(true);
        expect(valRes.body.contextWarning).toBe(false);
        expect(valRes.body.status).toBe("ACTIVE");
        expect(valRes.body.rawStatus).toBe(st);
      }

      // Missing product context returns warning but still non-blocking (canSubmit: true, allowed: true)
      const missingRes = await request(app)
        .get("/api/knowledge/validate-context?productId=NON_EXISTENT_PROD")
        .set("Authorization", `Bearer ${devToken}`);
      expect(missingRes.status).toBe(200);
      expect(missingRes.body.status).toBe("MISSING");
      expect(missingRes.body.hasContext).toBe(false);
      expect(missingRes.body.active).toBe(false);
      expect(missingRes.body.contextWarning).toBe(true);
      expect(missingRes.body.canSubmit).toBe(true);
      expect(missingRes.body.allowed).toBe(true);
      expect(missingRes.body.action).toBe("ADD_CONTEXT");
    });

    it("GET /api/knowledge/stats treats all non-deleted contexts as active with zero pending/rejected/outdated", async () => {
      const res = await request(app)
        .get("/api/knowledge/stats")
        .set("Authorization", `Bearer ${governorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("SUCCESS");
      expect(res.body.stats.active).toBe(res.body.stats.totalContexts);
      expect(res.body.stats.pendingApproval).toBe(0);
      expect(res.body.stats.rejected).toBe(0);
      expect(res.body.stats.outdated).toBe(0);
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

    it("POST /ingest prevents non-governor callers from specifying individual_id of another user and saves locally as ACTIVE", async () => {
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
      expect(res.body.context.status).toBe("ACTIVE");

      // Verify in DB that no document was created for sharedEmpId under SPOOF-INGEST
      const victimDoc = await ProductContext.findOne({ employeeId: sharedEmpId, productId: "SPOOF-INGEST" });
      expect(victimDoc).toBeNull();
    });
  });

  // =========================================================================
  // M1 Features F6, F7, F3, F9 Comprehensive Verification
  // =========================================================================
  describe("M1 Features F6, F7, F3, F9: Identity, Admin CRUD, Compliance Merge & Projections", () => {
    it("F6: resolves caller identity via User.findById fallback when JWT omits canonicalEmployeeId/employeeId/tenantId without EMP-BHIV-USR collision", async () => {
      const u1 = await User.create({
        name: "Fallback User One",
        email: "m1.test.u1.101@blackhole.ai",
        password: "Password123!",
        role: "User",
        canonicalEmployeeId: "EMP-M1-FALLBACK-01",
        employeeId: "M1FB01",
        tenantId: "ten-bhiv-core",
        stillExist: 1
      });
      const u2 = await User.create({
        name: "Fallback User Two",
        email: "m1.test.u2.102@blackhole.ai",
        password: "Password123!",
        role: "User",
        canonicalEmployeeId: "EMP-M1-FALLBACK-02",
        employeeId: "M1FB02",
        tenantId: "ten-bhiv-core",
        stillExist: 1
      });

      const bareToken1 = jwt.sign({ id: String(u1._id), role: "User" }, JWT_SECRET, { expiresIn: "1h" });
      const bareToken2 = jwt.sign({ id: String(u2._id), role: "User" }, JWT_SECRET, { expiresIn: "1h" });

      const r1 = await request(app)
        .post("/api/knowledge/contexts")
        .set("Authorization", `Bearer ${bareToken1}`)
        .send({ productId: "BHIV", content: "User 1 BHIV context" });
      expect(r1.status).toBe(201);
      expect(r1.body.employeeId).toBe("EMP-M1-FALLBACK-01");
      expect(r1.body.status).toBe("ACTIVE");

      const r2 = await request(app)
        .post("/api/knowledge/contexts")
        .set("Authorization", `Bearer ${bareToken2}`)
        .send({ productId: "BHIV", content: "User 2 BHIV context" });
      expect(r2.status).toBe(201);
      expect(r2.body.employeeId).toBe("EMP-M1-FALLBACK-02");
      expect(r2.body.status).toBe("ACTIVE");

      // Owner PUT succeeds with bare JWT
      const putRes = await request(app)
        .put(`/api/knowledge/contexts/${r1.body.contextId}`)
        .set("Authorization", `Bearer ${bareToken1}`)
        .send({ content: "User 1 updated BHIV context" });
      expect(putRes.status).toBe(200);
      expect(putRes.body.status).toBe("ACTIVE");
    });

    it("F6: POST /api/auth/login and GET /api/auth/me return employeeId, canonicalEmployeeId, tenantId, and organization", async () => {
      const loginUser = await User.create({
        name: "Login Claims User",
        email: "m1.test.login.205@blackhole.ai",
        password: "Password123!",
        role: "User",
        canonicalEmployeeId: "EMP-M1-LOGIN-205",
        employeeId: "BHIV205",
        tenantId: "ten-bhiv-core",
        organization: "BHIV",
        stillExist: 1
      });

      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ email: "m1.test.login.205@blackhole.ai", password: "Password123!" });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.user.employeeId).toBe("BHIV205");
      expect(loginRes.body.user.canonicalEmployeeId).toBe("EMP-M1-LOGIN-205");
      expect(loginRes.body.user.tenantId).toBe("ten-bhiv-core");
      expect(loginRes.body.user.organization).toBe("BHIV");

      const decoded = jwt.verify(loginRes.body.token, JWT_SECRET);
      expect(decoded.employeeId).toBe("BHIV205");
      expect(decoded.canonicalEmployeeId).toBe("EMP-M1-LOGIN-205");
      expect(decoded.tenantId).toBe("ten-bhiv-core");
      expect(decoded.organization).toBe("BHIV");

      const meRes = await request(app)
        .get("/api/auth/me")
        .set("x-auth-token", loginRes.body.token);
      expect(meRes.status).toBe(200);
      expect(meRes.body.canonicalEmployeeId).toBe("EMP-M1-LOGIN-205");
      expect(meRes.body.tenantId).toBe("ten-bhiv-core");
      expect(meRes.body.organization).toBe("BHIV");
    });

    it("F7: Manager/Admin can create (targetUserId), update, and delete contexts for target employees while non-admin spoofing is blocked", async () => {
      const targetUser = await User.create({
        name: "Target Employee",
        email: "m1.test.target.301@blackhole.ai",
        password: "Password123!",
        role: "User",
        canonicalEmployeeId: "EMP-M1-TARGET-301",
        employeeId: "M1TGT301",
        tenantId: "ten-bhiv-core",
        stillExist: 1
      });

      const mgrToken = generateToken({
        name: "Manager One",
        email: "mgr1@blackhole.ai",
        role: "Manager",
        canonicalEmployeeId: "EMP-M1-MGR-01",
        tenantId: "ten-bhiv-core"
      });

      const userToken = generateToken({
        id: String(targetUser._id),
        name: "Normal User",
        email: "normal@blackhole.ai",
        role: "User",
        canonicalEmployeeId: "EMP-M1-NORM-01",
        tenantId: "ten-bhiv-core"
      });

      // Manager creates for targetUserId
      const createRes = await request(app)
        .post("/api/knowledge/contexts")
        .set("Authorization", `Bearer ${mgrToken}`)
        .send({
          targetUserId: String(targetUser._id),
          productId: "SAMVAD",
          content: "Manager-created SAMVAD context for target employee"
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.employeeId).toBe("EMP-M1-TARGET-301");
      expect(String(createRes.body.user)).toBe(String(targetUser._id));
      expect(createRes.body.status).toBe("ACTIVE");

      // Manager updates target employee's context
      const updateRes = await request(app)
        .put(`/api/knowledge/contexts/${createRes.body.contextId}`)
        .set("Authorization", `Bearer ${mgrToken}`)
        .send({ content: "Manager-updated SAMVAD context" });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.status).toBe("ACTIVE");

      // Non-admin cannot spoof targetUserId/employeeId
      const spoofRes = await request(app)
        .post("/api/knowledge/contexts")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          targetUserId: String(targetUser._id),
          employeeId: "EMP-M1-TARGET-301",
          productId: "DRISHTI",
          content: "Spoof attempt"
        });
      expect(spoofRes.status).toBe(201);
      expect(spoofRes.body.employeeId).toBe("EMP-M1-NORM-01");

      // Manager deletes target employee's context
      const delRes = await request(app)
        .delete(`/api/knowledge/contexts/${createRes.body.contextId}`)
        .set("Authorization", `Bearer ${mgrToken}`)
        .send({ reason: "Admin cleanup" });
      expect(delRes.status).toBe(200);
      expect(delRes.body.context.status).toBe("DELETED");
    });

    it("F7: GET /compliance excludes deleted contexts and merges contexts across canonicalEmployeeId, employeeId, and user._id", async () => {
      const mergeUser = await User.create({
        name: "Merge Directory User",
        email: "m1.test.merge.401@blackhole.ai",
        password: "Password123!",
        role: "User",
        canonicalEmployeeId: "EMP-M1-MERGE-401",
        employeeId: "M1MRG401",
        tenantId: "ten-bhiv-core",
        stillExist: 1
      });
      const adminTok = generateToken({
        name: "Admin Compliance",
        email: "admin.comp@blackhole.ai",
        role: "Admin",
        canonicalEmployeeId: "EMP-M1-ADM-400",
        tenantId: "ten-bhiv-core"
      });

      const otherUid = new mongoose.Types.ObjectId();
      await ProductContext.create([
        {
          contextId: `CTX-M1-CAN-${Date.now()}`,
          employeeId: "EMP-M1-MERGE-401",
          user: mergeUser._id,
          productId: "BHIV",
          tenantId: "ten-bhiv-core",
          status: "ACTIVE",
          content: "Canonical context"
        },
        {
          contextId: `CTX-M1-LEG-${Date.now()}`,
          employeeId: "M1MRG401",
          user: otherUid,
          productId: "TRINETRA",
          tenantId: "ten-bhiv-core",
          status: "PENDING_APPROVAL",
          content: "Legacy employeeId context"
        },
        {
          contextId: `CTX-M1-USR-${Date.now()}`,
          employeeId: "EMP-OLD-ALIAS-401",
          user: mergeUser._id,
          productId: "UNIGURU",
          tenantId: "ten-bhiv-core",
          status: "REJECTED",
          content: "User ObjectId linked context"
        },
        {
          contextId: `CTX-M1-DEL-${Date.now()}`,
          employeeId: "EMP-M1-MERGE-401",
          user: mergeUser._id,
          productId: "PRAVESH",
          tenantId: "ten-bhiv-core",
          status: "DELETED",
          isDeleted: true,
          content: "Deleted context must be excluded"
        }
      ]);

      const compRes = await request(app)
        .get("/api/knowledge/compliance")
        .set("Authorization", `Bearer ${adminTok}`);
      expect(compRes.status).toBe(200);

      const entry = compRes.body.users.find(u => String(u._id) === String(mergeUser._id));
      expect(entry).toBeDefined();
      expect(entry.hasContext).toBe(true);
      expect(entry.contextCount).toBe(3);
      expect(entry.contextsByProduct.BHIV).toBeDefined();
      expect(entry.contextsByProduct.TRINETRA).toBeDefined();
      expect(entry.contextsByProduct.UNIGURU).toBeDefined();
      expect(entry.contextsByProduct.PRAVESH).toBeUndefined();
      expect(entry.contexts.some(c => c.isDeleted || c.status === "DELETED")).toBe(false);
    });

    it("F7: GET /contexts returns >100 items without truncation", async () => {
      const govTok = generateToken({
        name: "Akash",
        email: "akash@blackhole.ai",
        role: "Governor",
        canonicalEmployeeId: "EMP-BHIV-GOV-01",
        tenantId: "ten-bhiv-core"
      });
      const dummyUserId = new mongoose.Types.ObjectId();
      const bulkDocs = [];
      for (let i = 0; i < 105; i++) {
        bulkDocs.push({
          contextId: `CTX-PAG-${i}-${Date.now()}`,
          employeeId: `EMP-PAG-${i}`,
          user: dummyUserId,
          productId: "BHIV",
          productName: "BHIV",
          tenantId: "ten-bhiv-core",
          status: "ACTIVE",
          content: `Bulk context ${i}`
        });
      }
      await ProductContext.insertMany(bulkDocs);

      const res = await request(app)
        .get("/api/knowledge/contexts?search=EMP-PAG-")
        .set("Authorization", `Bearer ${govTok}`);
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(105);
      expect(res.body.total).toBe(105);
    });

    it("F3 & F9: task ingestion packet & register-intake propagate normalized product and task_id, and task/user projections include them", async () => {
      const packet = generateCanonicalTaskPacket(
        { title: "Test", description: "Desc", priority: "Medium", rawLength: 10, cleanedLength: 10 },
        "spec.txt",
        "text/plain",
        null,
        { task_id: "T-TST-901", product: "parikshak" }
      );
      expect(packet.taskDetails.product).toBe("PARIKSHAK");
      expect(packet.taskDetails.task_id).toBe("T-TST-901");

      const dept = await Department.create({ name: `Dept-M1-${Date.now()}` });
      const emp = await User.create({
        name: "Projection Employee",
        email: "m1.test.proj.501@blackhole.ai",
        password: "Password123!",
        role: "User",
        department: dept._id,
        canonicalEmployeeId: "EMP-M1-PROJ-501",
        employeeId: "BHIV501",
        tenantId: "ten-bhiv-core",
        stillExist: 1
      });
      const empToken = generateToken({
        id: String(emp._id),
        name: emp.name,
        email: emp.email,
        role: "User",
        canonicalEmployeeId: "EMP-M1-PROJ-501",
        employeeId: "BHIV501",
        tenantId: "ten-bhiv-core"
      });

      const intakeRes = await request(app)
        .post("/api/tasks/register-intake")
        .set("Authorization", `Bearer ${empToken}`)
        .send({
          originalInstruction: "Implement F3 product propagation check",
          product: "niyantran",
          task_id: "T-NIY-501",
          department: String(dept._id)
        });
      expect(intakeRes.status).toBe(201);
      expect(intakeRes.body.task.product).toBe("NIYANTRAN");
      expect(intakeRes.body.task.task_id).toBe("T-NIY-501");

      const tasksRes = await request(app)
        .get("/api/tasks?limit=20&page=1")
        .set("Authorization", `Bearer ${empToken}`);
      expect(tasksRes.status).toBe(200);
      const foundTask = tasksRes.body.tasks.find(t => t.task_id === "T-NIY-501");
      expect(foundTask).toBeDefined();
      expect(foundTask.product).toBe("NIYANTRAN");
      expect(foundTask.assignee.employeeId).toBe("BHIV501");
      expect(foundTask.assignee.canonicalEmployeeId).toBe("EMP-M1-PROJ-501");

      const userTasksRes = await request(app)
        .get(`/api/users/${emp._id}/tasks`)
        .set("Authorization", `Bearer ${empToken}`);
      expect(userTasksRes.status).toBe(200);
      const myTask = userTasksRes.body.find(t => t.task_id === "T-NIY-501");
      expect(myTask).toBeDefined();
      expect(myTask.assignee.canonicalEmployeeId).toBe("EMP-M1-PROJ-501");

      await TaskSubmission.create({
        task: foundTask._id,
        user: emp._id,
        githubLink: "https://github.com/bhiv/test-repo",
        notes: "Submission test"
      });
      const subRes = await request(app)
        .get(`/api/users/${emp._id}/submissions`)
        .set("Authorization", `Bearer ${empToken}`);
      expect(subRes.status).toBe(200);
      expect(subRes.body[0].task.task_id).toBe("T-NIY-501");
      expect(subRes.body[0].task.product).toBe("NIYANTRAN");

      await TaskSubmission.deleteMany({ user: emp._id });
      await Task.deleteMany({ _id: foundTask._id });
      await Department.deleteMany({ _id: dept._id });
    });
  });
});
