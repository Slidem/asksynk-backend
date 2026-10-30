import { AttentionItemStatus } from "@/api/attention/contract/attention-item-status.public";
import {
  AttentionItem,
  AttentionPreview,
  AttentionSource,
} from "@/api/attention/domain/attention-item";

// Wire shape of an attention item: the REST response and the AttentionItemUpserted
// payload. Built here so publishing (application) never reaches into presentation.
export type AttentionItemView = {
  id: string;
  userId: string;
  source: AttentionSource;
  preview: AttentionPreview;
  status: AttentionItemStatus;
  tagIds: string[];
  dueDate: string | null;
  dueDatePinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export function toAttentionItemView(item: AttentionItem): AttentionItemView {
  return {
    id: item.id,
    userId: item.userId,
    source: item.source,
    preview: item.preview,
    status: item.status,
    tagIds: item.tagIds,
    dueDate: item.dueDate ? item.dueDate.toISOString() : null,
    dueDatePinned: item.dueDatePinned,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
