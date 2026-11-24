/**
 * reconcileAmanTasks.js
 *
 * Feature 10: Historical Task Reconciliation for Aman Pal (BHIV80 / 6aeae0989bf43c32f0b2b14a)
 *
 * Requirements:
 * 1. Group tasks by assignee and normalized title.
 * 2. Designate 1 Canonical Task based on highest progress, valid submissions, and approval status.
 * 3. Mark redundant duplicate rows as SUPERSEDED_DUPLICATE in audit metadata with status "Closed"
 *    WITHOUT hard-deleting any historical records.
 * 4. Re-link any orphaned submissions to the Canonical Task.
 * 5. Support dry-run and execute modes with clear logging.
 *
 * Usage:
 *   node scripts/reconcileAmanTasks.js [--execute | --dry-run]
 */

"use strict";

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const Task = require("../models/Task");
const TaskSubmission = require("../models/TaskSubmission");
const User = require("../models/User");

const AMAN_DEFAULT_USER_ID = "6aeae0989bf43c32f0b2b14a";
const AMAN_DEFAULT_EMPLOYEE_ID = "BHIV80";

/**
 * Normalizes title string for grouping (removes extraneous whitespace, casing, and prefix noise)
 */
function normalizeTitle(title) {
  if (!title) return "";
  return title
    .trim()
    .toLowerCase()
    .replace(/^phase\s*\d+\s*[:\-]\s*/i, "")
    .replace(/[\s\-_]+/g, " ");
}

/**
 * Ranks task documents to designate 1 Canonical Task.
 * Higher score wins:
 * 1. Has submissions attached (+1000)
 * 2. Has approved/completed status (+500 / +400)
 * 3. Highest progress (+progress value)
 * 4. Recency (+createdAt/updatedAt timestamp)
 */
function scoreTaskCandidate(task, submissionsCount = 0) {
  let score = 0;

  // Submissions attached
  if (submissionsCount > 0) {
    score += 1000 * submissionsCount;
  }

  // Status priority
  const statusWeights = {
    "Approved": 500,
    "Completed": 400,
    "Submitted for Review": 300,
    "In Progress": 200,
    "Pending Validation": 100,
    "Pending": 50,
    "Closed": 10,
    "Returned": 5
  };
  score += statusWeights[task.status] || 0;

  // Progress
  score += (Number(task.progress) || 0);

  // Recency bonus (prefer older original creation date or latest activity)
  const timeVal = new Date(task.updatedAt || task.createdAt || 0).getTime();
  score += timeVal / 1e14; // small tie-breaker

  return score;
}

/**
 * Designates 1 canonical task from an array of duplicate task records.
 */
function selectCanonicalTask(tasks, submissionCounts = {}) {
  if (!tasks || tasks.length === 0) return null;
  if (tasks.length === 1) return tasks[0];

  let bestTask = tasks[0];
  let bestScore = -Infinity;

  for (const t of tasks) {
    const tId = t._id ? t._id.toString() : "";
    const count = submissionCounts[tId] || 0;
    const score = scoreTaskCandidate(t, count);
    if (score > bestScore) {
      bestScore = score;
      bestTask = t;
    }
  }

  return bestTask;
}

/**
 * Main reconciliation execution function.
 */
async function reconcileAmanTasks({
  dryRun = true,
  amanUserId = AMAN_DEFAULT_USER_ID,
  amanEmployeeId = AMAN_DEFAULT_EMPLOYEE_ID,
  mongoUri = null,
  externalDbConnection = false
} = {}) {
  const summary = {
    dryRun,
    targetAssignee: amanUserId,
    totalTasksScanned: 0,
    duplicateGroupsFound: 0,
    canonicalTasksDesignated: 0,
    duplicatesSuperseded: 0,
    submissionsRelinked: 0,
    details: []
  };

  let connectedLocally = false;
  if (!externalDbConnection && mongoose.connection.readyState !== 1) {
    const uri = mongoUri || process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://localhost:27017/niyantran";
    console.log(`🔌 [RECONCILE] Connecting to MongoDB (${dryRun ? "DRY-RUN MODE" : "LIVE EXECUTION"})...`);
    await mongoose.connect(uri);
    connectedLocally = true;
    console.log("✅ [RECONCILE] Connected to MongoDB.");
  }

  try {
    // 1. Resolve Aman User ID
    let targetUser = null;
    try {
      if (mongoose.Types.ObjectId.isValid(amanUserId)) {
        targetUser = await User.findById(amanUserId);
      }
      if (!targetUser) {
        targetUser = await User.findOne({
          $or: [
            { employeeId: amanEmployeeId },
            { canonicalEmployeeId: `EMP-${amanEmployeeId}` },
            { email: /blackholeinfiverse80@/i }
          ]
        });
      }
    } catch (userErr) {
      // In mock/test environments without connection, fall back gracefully
    }

    const effectiveUserId = targetUser ? targetUser._id : (mongoose.Types.ObjectId.isValid(amanUserId) ? new mongoose.Types.ObjectId(amanUserId) : null);

    if (!effectiveUserId) {
      console.warn(`⚠️ [RECONCILE] Target assignee ${amanUserId} / ${amanEmployeeId} not found in database. Scanning all tasks with assignee matching ID.`);
    }

    // 2. Fetch tasks for target user
    const query = effectiveUserId ? { assignee: effectiveUserId } : { $or: [{ assignee: amanUserId }] };
    const tasks = await Task.find(query).sort({ createdAt: 1 });
    summary.totalTasksScanned = tasks.length;
    console.log(`📊 [RECONCILE] Found ${tasks.length} total tasks for assignee ${effectiveUserId || amanUserId}.`);

    if (tasks.length === 0) {
      console.log("ℹ️ [RECONCILE] No tasks found to reconcile.");
      return summary;
    }

    // 3. Count submissions per task ID
    const taskIds = tasks.map(t => t._id);
    const submissions = await TaskSubmission.find({ task: { $in: taskIds } });
    const submissionCounts = {};
    const submissionsByTaskId = {};

    for (const sub of submissions) {
      const taskIdStr = sub.task.toString();
      submissionCounts[taskIdStr] = (submissionCounts[taskIdStr] || 0) + 1;
      if (!submissionsByTaskId[taskIdStr]) submissionsByTaskId[taskIdStr] = [];
      submissionsByTaskId[taskIdStr].push(sub);
    }

    // 4. Group tasks by normalized title
    const groups = {};
    for (const t of tasks) {
      const key = normalizeTitle(t.title);
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }

    // 5. Reconcile each group with duplicate entries
    for (const [normTitle, groupTasks] of Object.entries(groups)) {
      if (groupTasks.length <= 1) {
        continue; // No duplicates in this group
      }

      summary.duplicateGroupsFound++;
      const canonical = selectCanonicalTask(groupTasks, submissionCounts);
      summary.canonicalTasksDesignated++;

      const groupDetail = {
        title: normTitle,
        totalInGroup: groupTasks.length,
        canonicalTaskId: canonical._id.toString(),
        canonicalCustomTaskId: canonical.task_id || "N/A",
        canonicalStatus: canonical.status,
        canonicalProgress: canonical.progress,
        supersededTaskIds: [],
        relinkedSubmissionIds: []
      };

      console.log(`\n🔍 [RECONCILE GROUP] "${groupTasks[0].title}" (${groupTasks.length} duplicates found):`);
      console.log(`   🏆 CANONICAL TASK -> ID: ${canonical._id} (${canonical.task_id || 'no task_id'}), Status: ${canonical.status}, Progress: ${canonical.progress}%`);

      for (const task of groupTasks) {
        if (task._id.toString() === canonical._id.toString()) {
          // This is the canonical task, keep active/untouched except ensure valid metadata
          continue;
        }

        // Duplicate task to supersede
        groupDetail.supersededTaskIds.push(task._id.toString());
        summary.duplicatesSuperseded++;

        const currentMetadata = (task.metadata && typeof task.metadata === "object") ? task.metadata : {};
        const updateDoc = {
          status: "Closed",
          metadata: {
            ...currentMetadata,
            reconciliation_status: "SUPERSEDED_DUPLICATE",
            canonical_task_id: canonical._id.toString(),
            canonical_task_identifier: canonical.task_id || "",
            reconciled_at: new Date(),
            reconciled_by: "reconcileAmanTasks_script",
            reason: "Duplicate assignment generated via non-idempotent retry or cyclical title loop"
          }
        };

        console.log(`   🚫 SUPERSEDING DUPLICATE -> ID: ${task._id} (${task.task_id || 'no task_id'}), Current Status: ${task.status} -> Closed`);

        if (!dryRun) {
          await Task.updateOne(
            { _id: task._id },
            { $set: updateDoc }
          );
        }

        // Check if this superseded task had any submissions attached
        const orphanedSubs = submissionsByTaskId[task._id.toString()] || [];
        for (const sub of orphanedSubs) {
          groupDetail.relinkedSubmissionIds.push(sub._id.toString());
          summary.submissionsRelinked++;

          console.log(`      🔗 RE-LINKING SUBMISSION -> ${sub._id} from duplicate ${task._id} to canonical ${canonical._id}`);

          if (!dryRun) {
            const subMetadata = (sub.metadata && typeof sub.metadata === "object") ? sub.metadata : {};
            await TaskSubmission.updateOne(
              { _id: sub._id },
              {
                $set: {
                  task: canonical._id,
                  metadata: {
                    ...subMetadata,
                    relinkedFromDuplicateTaskId: task._id.toString(),
                    relinkedAt: new Date()
                  }
                }
              }
            );
          }
        }
      }

      summary.details.push(groupDetail);
    }

    console.log("\n=======================================================");
    console.log(`📋 RECONCILIATION SUMMARY (${dryRun ? "DRY-RUN" : "EXECUTED"})`);
    console.log("=======================================================");
    console.log(`Total tasks scanned: ${summary.totalTasksScanned}`);
    console.log(`Duplicate groups found: ${summary.duplicateGroupsFound}`);
    console.log(`Canonical tasks designated: ${summary.canonicalTasksDesignated}`);
    console.log(`Duplicate tasks superseded (status: Closed): ${summary.duplicatesSuperseded}`);
    console.log(`Orphaned submissions re-linked to canonical: ${summary.submissionsRelinked}`);
    if (dryRun) {
      console.log("\n💡 Dry-run complete. No database changes were applied.");
      console.log("   To execute live database updates, run: node scripts/reconcileAmanTasks.js --execute");
    } else {
      console.log("\n✅ Live reconciliation executed successfully.");
    }

    return summary;
  } catch (err) {
    console.error("❌ [RECONCILE ERROR]:", err);
    throw err;
  } finally {
    if (connectedLocally) {
      await mongoose.disconnect();
      console.log("🔌 [RECONCILE] Disconnected from MongoDB.");
    }
  }
}

// CLI entry point
if (require.main === module) {
  const isExecute = process.argv.includes("--execute");
  reconcileAmanTasks({ dryRun: !isExecute })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = {
  reconcileAmanTasks,
  selectCanonicalTask,
  scoreTaskCandidate,
  normalizeTitle,
  AMAN_DEFAULT_USER_ID,
  AMAN_DEFAULT_EMPLOYEE_ID
};
