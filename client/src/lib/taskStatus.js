export const COMPLETED_STATUSES = ["Completed", "Closed", "Submitted for Review"];
export const NOT_COMPLETED_GUARD_STATUSES = ["Pending Validation", "Returned"];
export const TASK_STATUS_OPTIONS = [
  "Pending Validation",
  "Approved",
  "Pending",
  "In Progress",
  "Submitted for Review",
  "Completed",
  "Closed",
  "Returned",
];

/**
 * Determine whether a task counts as completed across dashboards & leaderboards.
 * Mirrors server/utils/taskStats.js so frontend & backend counts always match.
 */
export function isTaskCompleted(task) {
  if (!task) return false;
  if (COMPLETED_STATUSES.includes(task.status)) return true;
  const progress = Number(task.progress) || 0;
  return progress >= 100 && !NOT_COMPLETED_GUARD_STATUSES.includes(task.status);
}

/**
 * Determine whether a task has reached a closed/completed state (excluding in-review).
 */
export function isTaskClosedOrCompleted(task) {
  if (!task) return false;
  if (task.status === "Completed" || task.status === "Closed") return true;
  const progress = Number(task.progress) || 0;
  return (
    progress >= 100 &&
    task.status !== "Submitted for Review" &&
    !NOT_COMPLETED_GUARD_STATUSES.includes(task.status)
  );
}

/**
 * Return consistent badge classes across dashboard & task list views for every workflow status.
 */
export function getTaskStatusBadgeClass(status) {
  switch (status) {
    case "Completed":
    case "Closed":
      return "bg-green-500/10 text-green-500 hover:bg-green-500/20 dark:bg-green-500/20 dark:text-green-400 dark:hover:bg-green-500/30";
    case "Submitted for Review":
      return "bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 dark:bg-purple-500/20 dark:text-purple-400 dark:hover:bg-purple-500/30";
    case "In Progress":
      return "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400 dark:hover:bg-blue-500/30";
    case "Approved":
      return "bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/20 dark:bg-cyan-500/20 dark:text-cyan-400 dark:hover:bg-cyan-500/30";
    case "Returned":
      return "bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 dark:bg-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-500/30";
    case "Pending":
    case "Pending Validation":
    case "Submitted":
      return "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 dark:bg-amber-500/20 dark:text-amber-400 dark:hover:bg-amber-500/30";
    default:
      return "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20 dark:bg-gray-500/20 dark:text-gray-400 dark:hover:bg-gray-500/30";
  }
}

