export const ATTENTION_ITEM_TYPES = [
  "tagged_message",
  "incoming_email",
  "slack_message",
  "whatsapp_message",
  "suggested_timeblock",
  "suggested_task",
  "task",
] as const;
export type AttentionItemType = (typeof ATTENTION_ITEM_TYPES)[number];

export const ATTENTION_ITEM_STATUSES = [
  "created",
  "in_progress",
  "resolved",
] as const;
export type AttentionItemStatus = (typeof ATTENTION_ITEM_STATUSES)[number];

export type TaggedMessageMetadata = {
  type: "tagged_message";
  messageId: string;
  threadId: string;
  senderId: string;
  senderType: "user" | "guest";
  content: string;
  originalTagIds: string[];
};

// Realized tagged task or batch. Exactly one of taskId / taskBatchId is set.
export type TaskMetadata = {
  type: "task";
  title: string;
  taskId?: string;
  taskBatchId?: string;
};

// Inbox item for a pending suggestion awaiting accept/reject.
export type SuggestedTaskMetadata = {
  type: "suggested_task";
  suggestionId: string;
  suggesterUserId: string;
  title: string;
};

export type AttentionItemMetadata =
  | TaggedMessageMetadata
  | TaskMetadata
  | SuggestedTaskMetadata;

export interface CreateAttentionItemInput {
  id: string;
  userId: string;
  type: AttentionItemType;
  dueDate: Date | null;
  // Explicit due date that must survive tag/calendar recomputes. Defaults false.
  dueDatePinned?: boolean;
  metadata: AttentionItemMetadata;
  tagIds: string[];
  sourceCalendarEventId: string | null;
}

export interface UpdateAttentionItemInput {
  id: string;
  userId: string;
  status?: AttentionItemStatus;
  note?: string | null;
  tagIds?: string[];
}

export interface ListAttentionItemsInput {
  status?: AttentionItemStatus;
  type?: AttentionItemType;
  limit?: number;
  cursor?: string;
}

// A domain object an attention item mirrors, found via metadata.
export type AttentionSource =
  | { taskId: string }
  | { taskBatchId: string }
  | { suggestionId: string }
  | { messageId: string };

// Create-or-update a single "task" item mirrored from a task or batch. The
// service creates when none exists (and tags present), updates in place
// otherwise (stable id), or removes when the source goes untagged.
export interface UpsertAttentionFromSourceInput {
  source: { taskId: string } | { taskBatchId: string };
  userId: string;
  title: string;
  status: AttentionItemStatus;
  tagIds: string[];
  dueDate: Date | null;
  dueDatePinned: boolean;
  sourceCalendarEventId: string | null;
}
