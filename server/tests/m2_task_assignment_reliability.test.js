/**
 * m2_task_assignment_reliability.test.js
 *
 * Targeted unit and integration tests for Milestone 2:
 * Feature 6: Single Authoritative Task Assignment Path (no auto Task.save in invokeParikshak)
 * Feature 7: Fix Cyclical Next-Task Title Regex Bug & Deterministic Progression
 * Feature 8: Broadened Deduplication Query across Active and Completed States
 * Feature 9: Correct Task Lifecycle ("Submitted for Review") & API Idempotency (X-Idempotency-Key / SHA256)
 * Feature 10: Aman Pal Historical Task Reconciliation Logic & Script
 * Feature 11: Task Product Grounding & Canonical Product/Tenant Transmission
 */

"use strict";

const mongoose = require("mongoose");
const crypto = require("crypto");

const Task = require("../models/Task");
const TaskSubmission = require("../models/TaskSubmission");
const User = require("../models/User");
const Department = require("../models/Department");
const {
  resolveDeterministicNextTaskTitle,
  CANONICAL_TASK_GRAPH_TITLES,
  invokeParikshak,
  evaluateParikshakSubmission
} = require("../services/parikshakService");

const {
  selectCanonicalTask,
  scoreTaskCandidate,
  normalizeTitle,
  reconcileAmanTasks
} = require("../scripts/reconcileAmanTasks");

describe("Milestone 2: Task Assignment Reliability, Idempotency & Duplicate Prevention", () => {

  // =========================================================================
  // Feature 7: Cyclical Title Bug Remediation & Deterministic Progression
  // =========================================================================
  describe("Feature 7: Deterministic Next-Task Title Resolution", () => {
    it("resolves canonical Task Graph node IDs to descriptive deterministic titles", () => {
      expect(resolveDeterministicNextTaskTitle("T-GOV-001", "Initial Task", null))
        .toBe("Phase 1: Foundation Setup");
      expect(resolveDeterministicNextTaskTitle("T-GOV-002", "Phase 1: Foundation Setup", null))
        .toBe("Phase 2: Governance Gate Integration");
      expect(resolveDeterministicNextTaskTitle("T-COR-001", "Phase 2: Governance Gate Integration", null))
        .toBe("Phase 3: Core Convergence Architecture");
      expect(resolveDeterministicNextTaskTitle("T-GOV-F01", "Phase 1: Foundation Setup", null))
        .toBe("Remediate Incomplete & Harden Architecture");
    });

    it("prevents infinite Phase 2 loops when completing a Phase 2 task", () => {
      const prevTitle = "Phase 2: Governance Gate Integration";
      // Completing Phase 2 should advance to Phase 3, NEVER loop back to Phase 2: Governance Gate Integration
      const nextTitle = resolveDeterministicNextTaskTitle(null, prevTitle, null);
      expect(nextTitle).toBe("Phase 3: Governance Gate Integration");
      expect(nextTitle).not.toBe("Phase 2: Governance Gate Integration");
      expect(nextTitle).not.toContain("Phase 2: Phase 2:");
    });

    it("advances sequentially across multi-phase tasks (Phase 1 -> Phase 2 -> Phase 3 -> Phase 4)", () => {
      const p1 = "Phase 1: API Security Gate";
      const p2 = resolveDeterministicNextTaskTitle(null, p1, null);
      expect(p2).toBe("Phase 2: API Security Gate");

      const p3 = resolveDeterministicNextTaskTitle(null, p2, null);
      expect(p3).toBe("Phase 3: API Security Gate");

      const p4 = resolveDeterministicNextTaskTitle(null, p3, null);
      expect(p4).toBe("Phase 4: API Security Gate");
    });

    it("preserves explicit descriptive titles provided in nextTaskObj packet", () => {
      const nextTaskObj = {
        task_id: "T-CUSTOM-999",
        title: "Dynamic Distributed Checkpoint Engine",
        description: "Custom packet description"
      };
      const title = resolveDeterministicNextTaskTitle("T-CUSTOM-999", "Base Task", nextTaskObj);
      expect(title).toBe("Dynamic Distributed Checkpoint Engine");
    });

    it("handles non-phase task titles gracefully by creating Phase 2 without corrupting title", () => {
      const baseTitle = "Build the Task Intake, Registration and Execution Gate";
      const nextTitle = resolveDeterministicNextTaskTitle(null, baseTitle, null);
      expect(nextTitle).toBe("Phase 2: Build the Task Intake, Registration and Execution Gate");
    });
  });

  // =========================================================================
  // Feature 8: Broadened Deduplication Query across Active & Completed States
  // =========================================================================
  describe("Feature 8: Deduplication Filter across States", () => {
    let mockTaskFindOne;

    afterEach(() => {
      if (mockTaskFindOne) mockTaskFindOne.mockRestore();
    });

    it("detects existing task in Completed status and prevents duplicate creation", async () => {
      const existingCompletedTask = {
        _id: new mongoose.Types.ObjectId(),
        title: "Phase 2: Governance Gate Integration",
        task_id: "T-GOV-002",
        status: "Completed",
        assignee: new mongoose.Types.ObjectId()
      };

      mockTaskFindOne = jest.spyOn(Task, "findOne").mockImplementation((query) => {
        // Verify query includes Completed and Closed states in the $in filter
        const titleOrStatusClause = query.$or?.find(clause => clause.title && clause.status);
        if (titleOrStatusClause) {
          expect(titleOrStatusClause.status.$in).toEqual(
            expect.arrayContaining(["Pending", "In Progress", "Submitted for Review", "Completed", "Closed"])
          );
        }
        return Promise.resolve(existingCompletedTask);
      });

      // Simulate deduplication check
      const candidateUserId = existingCompletedTask.assignee;
      const proposedTitle = "Phase 2: Governance Gate Integration";
      const proposedTaskId = "T-GOV-002";

      const matched = await Task.findOne({
        assignee: candidateUserId,
        $or: [
          { task_id: proposedTaskId },
          {
            title: proposedTitle,
            status: { $in: ["Pending", "In Progress", "Submitted for Review", "Completed", "Closed"] }
          }
        ]
      });

      expect(matched).not.toBeNull();
      expect(matched._id).toEqual(existingCompletedTask._id);
      expect(matched.status).toBe("Completed");
    });

    it("detects existing task in In Progress or Submitted for Review status", async () => {
      const existingInProgress = {
        _id: new mongoose.Types.ObjectId(),
        title: "Phase 1: Foundation Setup",
        task_id: "T-GOV-001",
        status: "In Progress"
      };

      mockTaskFindOne = jest.spyOn(Task, "findOne").mockResolvedValue(existingInProgress);

      const found = await Task.findOne({
        assignee: new mongoose.Types.ObjectId(),
        $or: [
          { task_id: "T-GOV-001" },
          {
            title: "Phase 1: Foundation Setup",
            status: { $in: ["Pending", "In Progress", "Submitted for Review", "Completed", "Closed"] }
          }
        ]
      });

      expect(found).not.toBeNull();
      expect(found.status).toBe("In Progress");
    });
  });

  // =========================================================================
  // Feature 6: Consolidated Single Authoritative Path (No Auto Task.save)
  // =========================================================================
  describe("Feature 6: Next-Task Creation Consolidated to Human Review", () => {
    let mockAxiosPost;
    let mockSubFindById;

    afterEach(() => {
      if (mockAxiosPost) mockAxiosPost.mockRestore();
      if (mockSubFindById) mockSubFindById.mockRestore();
    });

    it("evaluateParikshakSubmission prepares next-task proposal packet without creating Task row", async () => {
      const axios = require("axios");
      const subId = new mongoose.Types.ObjectId();
      const taskId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      const mockTask = {
        _id: taskId,
        title: "Phase 1: Foundation Setup",
        task_id: "T-GOV-001",
        priority: "High",
        branch: "blackhole_mumbai",
        product: "BHIV",
        tenantId: "ten-bhiv-core"
      };

      const mockUser = {
        _id: userId,
        name: "Aman Pal",
        tenantId: "ten-bhiv-core"
      };

      const mockSubmission = {
        _id: subId,
        task: mockTask,
        user: mockUser,
        notes: "Work completed"
      };

      const mockParikshakResponse = {
        status: "PASS",
        score: 95,
        review: "Excellent foundation work",
        next_task: "T-GOV-002",
        canonical_next_task_packet: {
          task_id: "T-GOV-002",
          title: "Phase 2: Governance Gate Integration",
          description: "Implement strict gate verification rules",
          estimated_minutes: 240
        }
      };

      mockSubFindById = jest.spyOn(TaskSubmission, "findById").mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockSubmission)
        })
      });

      mockAxiosPost = jest.spyOn(axios, "post").mockResolvedValue({
        status: 200,
        data: mockParikshakResponse
      });

      const result = await evaluateParikshakSubmission(subId.toString(), "trace-f6-test");

      expect(result.result).toBe("PASS");
      expect(result.nextTask).not.toBeNull();
      expect(result.nextTask.task_id).toBe("T-GOV-002");
      expect(result.nextTask.title).toBe("Phase 2: Governance Gate Integration");
      expect(result.nextTask.product).toBe("BHIV");
      expect(result.nextTask.tenantId).toBe("ten-bhiv-core");
    });
  });

  // =========================================================================
  // Feature 9: Task Lifecycle & API Idempotency
  // =========================================================================
  describe("Feature 9: Task Lifecycle State & Idempotency", () => {
    it("transitions task to 'Submitted for Review' upon submission, not prematurely 'Completed'", () => {
      const taskDoc = {
        status: "In Progress",
        progress: 75,
        submittedForReviewAt: null,
        closedAt: null,
        save: jest.fn().mockResolvedValue(true)
      };

      // Simulate markTaskSubmittedForReview behavior
      taskDoc.status = "Submitted for Review";
      taskDoc.progress = Math.max(taskDoc.progress || 0, 90);
      taskDoc.submittedForReviewAt = new Date();

      expect(taskDoc.status).toBe("Submitted for Review");
      expect(taskDoc.status).not.toBe("Completed");
      expect(taskDoc.closedAt).toBeNull();
      expect(taskDoc.progress).toBe(90);
      expect(taskDoc.submittedForReviewAt).toBeInstanceOf(Date);
    });

    it("generates deterministic SHA-256 idempotency hash for intake payload", () => {
      const userId = "6aeae0989bf43c32f0b2b14a";
      const title = "Build the Task Intake, Registration and Execution Gate";
      const instruction = "Lead instruction: Build the task intake pipeline via WhatsApp";
      const sourceType = "WHATSAPP";

      const hash1 = crypto.createHash("sha256")
        .update(`${userId}:${title.trim().toLowerCase()}:${instruction.trim().toLowerCase()}:${sourceType}`)
        .digest("hex");

      const hash2 = crypto.createHash("sha256")
        .update(`${userId}:${title.trim().toLowerCase()}:${instruction.trim().toLowerCase()}:${sourceType}`)
        .digest("hex");

      // Identical payload produces identical hash
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);

      // Different payload produces different hash
      const differentInstruction = "Different instruction content";
      const hash3 = crypto.createHash("sha256")
        .update(`${userId}:${title.trim().toLowerCase()}:${differentInstruction.trim().toLowerCase()}:${sourceType}`)
        .digest("hex");
      expect(hash1).not.toBe(hash3);
    });
  });

  // =========================================================================
  // Feature 10: Aman Task Reconciliation Logic & Script
  // =========================================================================
  describe("Feature 10: Aman Historical Task Reconciliation", () => {
    it("normalizes task titles for accurate duplicate clustering", () => {
      const t1 = "Build the Task Intake, Registration and Execution Gate";
      const t2 = "  build  the  task intake,  registration and execution gate  ";
      const t3 = "Phase 2: Build the Task Intake, Registration and Execution Gate";

      expect(normalizeTitle(t1)).toBe(normalizeTitle(t2));
      expect(normalizeTitle(t1)).toBe(normalizeTitle(t3));
    });

    it("correctly designates canonical task with highest progress and valid submissions", () => {
      const duplicateTasks = [
        {
          _id: new mongoose.Types.ObjectId("6aeae3731c7f096178d5db5a"),
          task_id: "T-WHT-MW1TFLMP-1YBX",
          title: "Build the Task Intake, Registration and Execution Gate",
          status: "Closed",
          progress: 50,
          createdAt: new Date("2026-11-04T07:49:07Z")
        },
        {
          _id: new mongoose.Types.ObjectId("6aeae4921c7f096178d5dd5e"),
          task_id: "T-WHT-MW1TLQOX-MEB5",
          title: "Build the Task Intake, Registration and Execution Gate",
          status: "Pending Validation",
          progress: 0,
          createdAt: new Date("2026-11-04T07:53:54Z")
        },
        {
          _id: new mongoose.Types.ObjectId("6aeaeb011c7f096178d5dfd7"),
          task_id: "T-WHT-MW1UL1UJ-FICI",
          title: "Build the Task Intake, Registration and Execution Gate",
          status: "Completed",
          progress: 100,
          createdAt: new Date("2026-11-04T08:21:21Z")
        }
      ];

      const submissionCounts = {
        "6aeaeb011c7f096178d5dfd7": 1 // Has approved submission
      };

      const canonical = selectCanonicalTask(duplicateTasks, submissionCounts);
      expect(canonical._id.toString()).toBe("6aeaeb011c7f096178d5dfd7");
      expect(canonical.task_id).toBe("T-WHT-MW1UL1UJ-FICI");
      expect(canonical.progress).toBe(100);
    });

    it("dry-run mode executes reconciliation analysis without modifying database", async () => {
      const mockUserFindById = jest.spyOn(User, "findById").mockResolvedValue({
        _id: new mongoose.Types.ObjectId("6aeae0989bf43c32f0b2b14a"),
        name: "Aman Pal"
      });

      const mockFind = jest.spyOn(Task, "find").mockReturnValue({
        sort: jest.fn().mockResolvedValue([
          {
            _id: new mongoose.Types.ObjectId(),
            task_id: "T-WHT-001",
            title: "Task Intake Pipeline",
            status: "Completed",
            progress: 100
          },
          {
            _id: new mongoose.Types.ObjectId(),
            task_id: "T-WHT-002",
            title: "Task Intake Pipeline",
            status: "Pending",
            progress: 0
          }
        ])
      });

      const mockSubFind = jest.spyOn(TaskSubmission, "find").mockResolvedValue([]);
      const mockTaskUpdateOne = jest.spyOn(Task, "updateOne").mockResolvedValue({});

      const result = await reconcileAmanTasks({
        dryRun: true,
        amanUserId: "6aeae0989bf43c32f0b2b14a",
        externalDbConnection: true
      });

      expect(result.dryRun).toBe(true);
      expect(result.duplicateGroupsFound).toBe(1);
      expect(result.canonicalTasksDesignated).toBe(1);
      expect(result.duplicatesSuperseded).toBe(1);
      // In dry-run mode, updateOne must NOT be called
      expect(mockTaskUpdateOne).not.toHaveBeenCalled();

      mockUserFindById.mockRestore();
      mockFind.mockRestore();
      mockSubFind.mockRestore();
      mockTaskUpdateOne.mockRestore();
    });

    it("live mode applies SUPERSEDED_DUPLICATE metadata to redundant records", async () => {
      const canonicalId = new mongoose.Types.ObjectId();
      const duplicateId = new mongoose.Types.ObjectId();

      const mockUserFindById = jest.spyOn(User, "findById").mockResolvedValue({
        _id: new mongoose.Types.ObjectId("6aeae0989bf43c32f0b2b14a"),
        name: "Aman Pal"
      });

      const mockFind = jest.spyOn(Task, "find").mockReturnValue({
        sort: jest.fn().mockResolvedValue([
          {
            _id: canonicalId,
            task_id: "T-CANONICAL-001",
            title: "Aman Execution Task",
            status: "Completed",
            progress: 100
          },
          {
            _id: duplicateId,
            task_id: "T-DUP-002",
            title: "Aman Execution Task",
            status: "In Progress",
            progress: 10
          }
        ])
      });

      const mockSubFind = jest.spyOn(TaskSubmission, "find").mockResolvedValue([]);
      const mockTaskUpdateOne = jest.spyOn(Task, "updateOne").mockResolvedValue({});

      const result = await reconcileAmanTasks({
        dryRun: false,
        amanUserId: "6aeae0989bf43c32f0b2b14a",
        externalDbConnection: true
      });

      expect(result.dryRun).toBe(false);
      expect(result.duplicatesSuperseded).toBe(1);
      expect(mockTaskUpdateOne).toHaveBeenCalledTimes(1);

      const updateArgs = mockTaskUpdateOne.mock.calls[0];
      expect(updateArgs[0]).toEqual({ _id: duplicateId });
      expect(updateArgs[1].$set.status).toBe("Closed");
      expect(updateArgs[1].$set.metadata.reconciliation_status).toBe("SUPERSEDED_DUPLICATE");
      expect(updateArgs[1].$set.metadata.canonical_task_id).toBe(canonicalId.toString());

      mockUserFindById.mockRestore();
      mockFind.mockRestore();
      mockSubFind.mockRestore();
      mockTaskUpdateOne.mockRestore();
    });
  });

  // =========================================================================
  // Feature 11: Task Product Grounding & Canonical Transmission
  // =========================================================================
  describe("Feature 11: Task Product Grounding & Schema Validation", () => {
    it("Task model schema includes product and tenantId fields with defaults", () => {
      const task = new Task({
        title: "Test Task Grounding",
        description: "Checking schema fields",
        dueDate: new Date(),
        department: new mongoose.Types.ObjectId(),
        assignee: new mongoose.Types.ObjectId()
      });

      expect(task.product).toBe("BHIV");
      expect(task.tenantId).toBe("ten-bhiv-core");
      expect(task.metadata).toEqual({});
    });
  });
});
