import { TaskSuggestionPayload } from "@/api/tasks/contract/task-suggestion.port";

export const TASK_STATUSES = ["todo", "in_progress", "completed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_LIST_SCOPES = ["created_by_me", "assigned_to_me"] as const;
export type TaskListScope = (typeof TASK_LIST_SCOPES)[number];

export interface CreateTaskInput {
  createdBy: string;
  // Single owner. Direct create = creator; suggestion accept = suggestee.
  assigneeUserId: string;
  title: string;
  description?: string | null;
  dueDate?: Date | null;
  tagIds: string[];
  batchId?: string | null;
}

export interface UpdateTaskInput {
  id: string;
  userId: string;
  title?: string;
  description?: string | null;
  dueDate?: Date | null;
  status?: TaskStatus;
  tagIds?: string[];
}

export interface ListTasksInput {
  scope: TaskListScope;
  status?: TaskStatus;
  batchId?: string;
  cursor?: string;
  limit?: number;
}

export interface CreateTaskBatchInput {
  createdBy: string;
  assigneeUserId: string;
  title: string;
  // Batch-level: applies to the whole batch (drives the single batch attention item).
  dueDate?: Date | null;
  tagIds: string[];
  // Batched tasks carry title/description only — tags + dueDate live on the batch.
  tasks: {
    title: string;
    description?: string | null;
  }[];
}

export interface UpdateTaskBatchInput {
  id: string;
  userId: string;
  title?: string;
  dueDate?: Date | null;
  tagIds?: string[];
}

export const TASK_SUGGESTION_STATUSES = [
  "pending",
  "accepted",
  "rejected",
] as const;
export type TaskSuggestionStatus = (typeof TASK_SUGGESTION_STATUSES)[number];

export interface CreateTaskSuggestionInput {
  suggesterUserId: string;
  suggesteeUserId: string;
  payload: TaskSuggestionPayload;
}

// Partial edit of a pending suggestion's payload by either party. `kind` is
// immutable; `tasks` only applies to batch suggestions.
export interface UpdateTaskSuggestionPayloadInput {
  id: string;
  userId: string;
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  tagIds?: string[];
  tasks?: {
    title: string;
    description: string | null;
  }[];
}
