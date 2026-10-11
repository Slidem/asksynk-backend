import { Task } from "@/api/tasks/domain/task";
import { TaskBatch } from "@/api/tasks/domain/task-batch";
import { TaskResponse } from "@/api/tasks/presentation/rest/responses/task.response";
import { TaskBatchResponse } from "@/api/tasks/presentation/rest/responses/task-batch.response";

export function toTaskResponse(task: Task): TaskResponse {
  return {
    id: task.id,
    batchId: task.batchId,
    createdBy: task.createdBy,
    assigneeUserId: task.assigneeUserId,
    title: task.title,
    description: task.description,
    status: task.status,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    tagIds: task.tagIds,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function toTaskBatchResponse(
  batch: TaskBatch,
  tasks: Task[],
): TaskBatchResponse {
  return {
    id: batch.id,
    createdBy: batch.createdBy,
    assigneeUserId: batch.assigneeUserId,
    title: batch.title,
    dueDate: batch.dueDate ? batch.dueDate.toISOString() : null,
    tagIds: batch.tagIds,
    tasks: tasks.map(toTaskResponse),
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
  };
}
