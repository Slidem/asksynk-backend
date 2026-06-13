import { AttentionItemStatus } from "@/api/attention-items/models/attention-item.model";
import { TaskStatus } from "@/api/tasks/models/task.model";

// A single task's status maps directly onto its attention item.
export function mapTaskStatusToAttention(
  status: TaskStatus,
): AttentionItemStatus {
  if (status === "completed") return "resolved";
  if (status === "in_progress") return "in_progress";
  return "created";
}

// Batch attention status: all done → resolved, all untouched → created, else in progress.
export function aggregateBatchStatus(
  statuses: TaskStatus[],
): AttentionItemStatus {
  if (statuses.length === 0) return "created";
  if (statuses.every((s) => s === "completed")) return "resolved";
  if (statuses.every((s) => s === "todo")) return "created";
  return "in_progress";
}
