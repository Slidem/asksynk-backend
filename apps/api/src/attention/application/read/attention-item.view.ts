import { AttentionItemStatus } from "@/api/attention/contract/attention-item-status.public";
import { AttentionItem } from "@/api/attention/domain/attention-item";
import {
  AttentionItemMetadata,
  AttentionItemType,
} from "@/api/attention/domain/attention-item.model";

// Wire shape of an attention item: the REST response and the AttentionItemUpserted
// payload. Built here so publishing (application) never reaches into presentation.
export type AttentionItemView = {
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
};

export function toAttentionItemView(item: AttentionItem): AttentionItemView {
  return {
    id: item.id,
    userId: item.userId,
    type: item.type,
    status: item.status,
    dueDate: item.dueDate ? item.dueDate.toISOString() : null,
    note: item.note,
    metadata: item.metadata,
    tagIds: item.tagIds,
    sourceCalendarEventId: item.sourceCalendarEventId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
