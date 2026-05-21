export type AttentionItemType =
  | "tagged_message"
  | "incoming_email"
  | "slack_message"
  | "whatsapp_message"
  | "suggested_timeblock"
  | "suggested_task";

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

export type AttentionItemMetadata = TaggedMessageMetadata;

export interface CreateAttentionItemInput {
  id: string;
  userId: string;
  type: AttentionItemType;
  dueDate: Date | null;
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
