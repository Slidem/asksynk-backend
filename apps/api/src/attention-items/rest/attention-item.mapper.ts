import { AttentionItem } from "@/api/attention-items/entities/attention-item.entity";
import { AttentionItemResponse } from "@/api/attention-items/rest/responses/attention-item.response";

export function toAttentionItemResponse(item: AttentionItem): AttentionItemResponse {
  return {
    id: item.id,
    userId: item.userId,
    type: item.type,
    status: item.status,
    dueDate: item.dueDate ? item.dueDate.toISOString() : null,
    note: item.note,
    metadata: item.metadata,
    tagIds: item.tagIds,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
