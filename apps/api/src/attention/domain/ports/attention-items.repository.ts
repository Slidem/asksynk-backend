import { AttentionItemStatus } from "@/api/attention/contract/attention-item-status.public";
import { AttentionItem } from "@/api/attention/domain/attention-item";
import {
  AttentionItemMetadata,
  CreateAttentionItemInput,
  ListAttentionItemsInput,
} from "@/api/attention/domain/attention-item.model";

export abstract class AttentionItemsRepository {
  abstract add(input: CreateAttentionItemInput): Promise<AttentionItem>;
  abstract getById(id: string): Promise<AttentionItem | null>;
  abstract listByUserId(
    userId: string,
    input: ListAttentionItemsInput,
  ): Promise<AttentionItem[]>;
  abstract update(item: AttentionItem): Promise<AttentionItem>;
  abstract updateFromSource(input: {
    id: string;
    status: AttentionItemStatus;
    metadata: AttentionItemMetadata;
    tagIds: string[];
    dueDate: Date | null;
    dueDatePinned: boolean;
    sourceCalendarEventId: string | null;
  }): Promise<AttentionItem>;
  abstract softDelete(id: string): Promise<void>;
  abstract deleteTagAssociations(tagId: string): Promise<void>;
  abstract updateDueDate(
    id: string,
    dueDate: Date | null,
    sourceCalendarEventId: string | null,
  ): Promise<void>;
  abstract updateContent(
    id: string,
    metadata: AttentionItemMetadata,
    dueDate: Date | null,
  ): Promise<void>;
  abstract batchUpdateDueDates(
    updates: {
      id: string;
      dueDate: Date | null;
      sourceCalendarEventId: string | null;
    }[],
  ): Promise<void>;
  abstract findByTagIds(tagIds: string[]): Promise<AttentionItem[]>;
  abstract findByMessageId(messageId: string): Promise<AttentionItem[]>;
  abstract findByTaskId(taskId: string): Promise<AttentionItem[]>;
  abstract findByTaskBatchId(batchId: string): Promise<AttentionItem[]>;
  abstract findBySuggestionId(suggestionId: string): Promise<AttentionItem[]>;
  abstract findBySourceCalendarEventId(
    eventId: string,
  ): Promise<AttentionItem[]>;
}
