import { Task } from "@/api/tasks/entities/task.entity";
import { TaskBatch } from "@/api/tasks/entities/task-batch.entity";
import { TaskSuggestion } from "@/api/tasks/entities/task-suggestion.entity";
import { TaskResponse } from "@/api/tasks/rest/responses/task.response";
import { TaskBatchResponse } from "@/api/tasks/rest/responses/task-batch.response";
import {
  MaterializedTask,
  TaskSuggestionResponse,
} from "@/api/tasks/rest/responses/task-suggestion.response";

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

export function toTaskSuggestionResponse(
  suggestion: TaskSuggestion,
  materializedTasks: MaterializedTask[] = [],
): TaskSuggestionResponse {
  return {
    id: suggestion.id,
    suggesterUserId: suggestion.suggesterUserId,
    suggesteeUserId: suggestion.suggesteeUserId,
    status: suggestion.status,
    payload: suggestion.payload,
    materializedTasks,
    createdAt: suggestion.createdAt.toISOString(),
    updatedAt: suggestion.updatedAt.toISOString(),
  };
}
