import { AttentionItemStatus } from "@/api/attention/contract/attention-item-status.public";
import { TaskStatus } from "@/api/tasks/domain/task.model";

// A single task's status maps directly onto its attention item.
export function mapTaskStatusToAttention(
  status: TaskStatus,
): AttentionItemStatus {
  if (status === "completed") return "resolved";
  if (status === "in_progress") return "in_progress";
  return "created";
}
