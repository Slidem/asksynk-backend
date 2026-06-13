export type TaskStatus = "todo" | "in_progress" | "completed";

export type TaskListScope = "created_by_me" | "assigned_to_me";

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
  description?: string | null;
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
  description?: string | null;
  dueDate?: Date | null;
  tagIds?: string[];
}

export type TaskSuggestionStatus = "pending" | "accepted" | "rejected";

// Stored as jsonb in task_suggestions.payload. Materialized tasks are always
// assigned to the suggestee, so assignees are not part of the payload. Tags MUST
// belong to the suggestee (they drive the suggestee's attention once accepted);
// the suggester pre-assigns them and the suggestee may adjust before/after accept.
export interface TaskSuggestionPayload {
  kind: "task" | "batch";
  title: string;
  description: string | null;
  // Task due date (kind="task") or batch-level due date (kind="batch").
  dueDate: string | null;
  // The suggestee's tags. Task-level (kind="task") or batch-level (kind="batch").
  tagIds: string[];
  // For kind="batch" only.
  tasks: {
    title: string;
    description: string | null;
  }[];
}

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
