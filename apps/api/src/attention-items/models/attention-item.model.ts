export type AttentionItemType =
  | "tagged_message"
  | "incoming_email"
  | "slack_message"
  | "whatsapp_message"
  | "suggested_timeblock"
  | "suggested_task"
  | "task";

export type AttentionItemStatus = "created" | "in_progress" | "resolved";

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

// A non-message domain object an attention item mirrors, found via metadata.
export type AttentionSource =
  | { taskId: string }
  | { taskBatchId: string }
  | { suggestionId: string };
