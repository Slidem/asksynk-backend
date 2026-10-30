import {
  AttentionItem,
  AttentionItemState,
  AttentionSource,
  ListAttentionItemsInput,
} from "@/api/attention/domain/attention-item";

export abstract class AttentionItemsRepository {
  abstract getById(id: string): Promise<AttentionItem | null>;
  abstract listByUserId(
    userId: string,
    input: ListAttentionItemsInput,
  ): Promise<AttentionItem[]>;
  abstract findBySource(
    userId: string,
    source: AttentionSource,
  ): Promise<AttentionItem | null>;
  abstract upsert(state: AttentionItemState): Promise<AttentionItem | null>;
  abstract deleteLiveBySource(
    userId: string,
    source: AttentionSource,
  ): Promise<string | null>;
  abstract softDelete(id: string): Promise<void>;
  abstract deleteTagAssociations(tagId: string): Promise<void>;
  abstract batchUpdateDueDates(
    updates: {
      id: string;
      dueDate: Date | null;
      dueSourceEventId: string | null;
    }[],
  ): Promise<AttentionItem[]>;
  abstract findByTagIds(tagIds: string[]): Promise<AttentionItem[]>;
  abstract findByDueSourceEventId(eventId: string): Promise<AttentionItem[]>;
}
