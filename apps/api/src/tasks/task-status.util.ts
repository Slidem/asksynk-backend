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
