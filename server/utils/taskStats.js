const COMPLETED_STATUSES = ["Completed", "Closed", "Submitted for Review"];
const PENDING_STATUSES = ["Pending", "Pending Validation", "Approved", "Returned", "Submitted"];
const NOT_COMPLETED_GUARD_STATUSES = ["Pending Validation", "Returned"];

/**
 * Determine if a task should count as completed across dashboards & stats.
 * Treats terminal/review-submitted statuses OR 100%-progress active tasks as completed.
 */
function isTaskCompleted(task) {
  if (!task) return false;
  if (COMPLETED_STATUSES.includes(task.status)) return true;
  const progress = Number(task.progress) || 0;
  return progress >= 100 && !NOT_COMPLETED_GUARD_STATUSES.includes(task.status);
}

/**
 * Determine if a task is actively in progress (< 100% and not yet completed).
 */
function isTaskInProgress(task) {
  if (!task) return false;
  return !isTaskCompleted(task) && task.status === "In Progress";
}

/**
 * Determine if a task is pending / awaiting start or validation.
 */
function isTaskPending(task) {
  if (!task) return false;
  return !isTaskCompleted(task) && !isTaskInProgress(task);
}

/**
 * Partition a list of task documents into mutually exclusive buckets
 * so total === completed + inProgress + pending always holds.
 */
function computeUserTaskCounts(tasks = []) {
  let completed = 0;
  let inProgress = 0;
  let pending = 0;

  for (const task of tasks) {
    if (isTaskCompleted(task)) {
      completed += 1;
    } else if (isTaskInProgress(task)) {
      inProgress += 1;
    } else {
      pending += 1;
    }
  }

  return {
    total: tasks.length,
    completed,
    inProgress,
    pending,
  };
}

const COMPLETED_MATCH = {
  $or: [
    { status: { $in: COMPLETED_STATUSES } },
    { progress: { $gte: 100 }, status: { $nin: NOT_COMPLETED_GUARD_STATUSES } },
  ],
};

const IN_PROGRESS_MATCH = {
  status: "In Progress",
  progress: { $not: { $gte: 100 } },
};

const PENDING_MATCH = {
  status: { $nin: [...COMPLETED_STATUSES, "In Progress"] },
  $or: [
    { progress: { $not: { $gte: 100 } } },
    { status: { $in: NOT_COMPLETED_GUARD_STATUSES } },
  ],
};

/**
 * Run a single non-overlapping $facet aggregation to count total, completed,
 * inProgress, and pending tasks for any matchFilter.
 */
async function aggregateTaskBuckets(matchFilter, TaskModel) {
  const [taskStats] = await TaskModel.aggregate([
    { $match: matchFilter || {} },
    {
      $facet: {
        total: [{ $count: "count" }],
        completed: [{ $match: COMPLETED_MATCH }, { $count: "count" }],
        inProgress: [{ $match: IN_PROGRESS_MATCH }, { $count: "count" }],
        pending: [{ $match: PENDING_MATCH }, { $count: "count" }],
      },
    },
  ]);

  const total = taskStats?.total?.[0]?.count || 0;
  const completed = taskStats?.completed?.[0]?.count || 0;
  const inProgress = taskStats?.inProgress?.[0]?.count || 0;
  const pending = taskStats?.pending?.[0]?.count || 0;

  return { total, completed, inProgress, pending };
}

module.exports = {
  COMPLETED_STATUSES,
  PENDING_STATUSES,
  NOT_COMPLETED_GUARD_STATUSES,
  COMPLETED_MATCH,
  IN_PROGRESS_MATCH,
  PENDING_MATCH,
  isTaskCompleted,
  isTaskInProgress,
  isTaskPending,
  computeUserTaskCounts,
  aggregateTaskBuckets,
};

