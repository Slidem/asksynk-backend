export const TASK_SUGGESTION_KINDS = ["task", "batch"] as const;
export type TaskSuggestionKind = (typeof TASK_SUGGESTION_KINDS)[number];

// Stored as jsonb in task_suggestions.payload. Materialized tasks are always
// assigned to the suggestee, so assignees are not part of the payload. Tags MUST
// belong to the suggestee (they drive the suggestee's attention once accepted);
// the suggester pre-assigns them and the suggestee may adjust before/after accept.
export interface TaskSuggestionPayload {
  kind: TaskSuggestionKind;
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

// What other contexts may ask tasks: open a suggestion inside the caller's
// transaction (a message embedding a suggestion commits with it).
export abstract class TaskSuggestionPort {
  // Throws `tasks.*` (self-suggestion, invalid payload), `networks.*` (not
  // connected) or `tags.*` (tags not owned by the suggestee).
  abstract suggest(input: {
    suggesterUserId: string;
    suggesteeUserId: string;
    payload: TaskSuggestionPayload;
  }): Promise<{ id: string }>;
}
