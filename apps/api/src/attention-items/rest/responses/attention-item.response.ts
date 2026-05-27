import {
  AttentionItemMetadata,
  AttentionItemStatus,
  AttentionItemType,
} from "@/api/attention-items/models/attention-item.model";

export interface AttentionItemResponse {
  id: string;
  userId: string;
  type: AttentionItemType;
  status: AttentionItemStatus;
  dueDate: string | null;
  note: string | null;
  metadata: AttentionItemMetadata;
  tagIds: string[];
  sourceCalendarEventId: string | null;
  createdAt: string;
  updatedAt: string;
}
