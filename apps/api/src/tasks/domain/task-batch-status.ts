import { TaskStatus } from "@/api/tasks/domain/task.model";

// Batch status: all completed → completed, empty or all todo → todo, else in progress.
export function deriveBatchStatus(statuses: TaskStatus[]): TaskStatus {
  if (statuses.length === 0) return "todo";
  if (statuses.every((s) => s === "completed")) return "completed";
  if (statuses.every((s) => s === "todo")) return "todo";
  return "in_progress";
}
