import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { AttentionItemsRepository } from "@/api/attention-items/attention-items.repository";
import { AttentionItem } from "@/api/attention-items/entities/attention-item.entity";
import {
  AttentionItemStatus,
  AttentionSource,
  CreateAttentionItemInput,
  ListAttentionItemsInput,
  UpdateAttentionItemInput,
} from "@/api/attention-items/models/attention-item.model";
import { toAttentionItemResponse } from "@/api/attention-items/rest/attention-item.mapper";
import { AsksynkError } from "@/api/common/errors/errors.model";
import { EventsPublisher } from "@/shared/event-publisher/events-publisher";
import {
  AttentionItemCreated,
  AttentionItemUpdated,
} from "@/shared/event-registry/events.registry";

@Injectable()
export class AttentionItemsService {
  constructor(
    private readonly attentionItemsRepository: AttentionItemsRepository,
    private readonly eventsPublisher: EventsPublisher,
  ) {}

  /**
   * Single create chokepoint for every ingestion path: persists the item and
   * publishes `attention.created` (realtime). The outbox insert joins the caller's
   * transaction, so the emit only fires once the item is committed.
   */
  @Transactional()
  async create(input: CreateAttentionItemInput): Promise<AttentionItem> {
    const item = await this.attentionItemsRepository.add(input);
    await this.eventsPublisher.publish(AttentionItemCreated, {
      item: toAttentionItemResponse(item),
    });
    return item;
  }

  @Transactional()
  async getAttentionItem(userId: string, id: string): Promise<AttentionItem> {
    const item = await this.attentionItemsRepository.getById(id);
    if (!item || item.isDeleted || !item.belongsTo(userId)) {
      throw AsksynkError.notFound("Attention item not found");
    }
    return item;
  }

  @Transactional()
  async listAttentionItems(
    userId: string,
    input: ListAttentionItemsInput,
  ): Promise<AttentionItem[]> {
    return this.attentionItemsRepository.listByUserId(userId, input);
  }

  @Transactional()
  async updateAttentionItem(
    input: UpdateAttentionItemInput,
  ): Promise<AttentionItem> {
    const item = await this.attentionItemsRepository.getById(input.id);
    if (!item || item.isDeleted || !item.belongsTo(input.userId)) {
      throw AsksynkError.notFound("Attention item not found");
    }

    if (input.status !== undefined) item.status = input.status;
    if (input.note !== undefined) item.note = input.note;
    if (input.tagIds !== undefined) item.tagIds = input.tagIds;

    const updated = await this.attentionItemsRepository.update(item);
    await this.eventsPublisher.publish(AttentionItemUpdated, {
      item: toAttentionItemResponse(updated),
    });
    return updated;
  }

  /**
   * System-driven status sync for items mirrored from a task, batch or
   * suggestion. Updates every linked item (one per assignee) and emits
   * `attention.updated`. No `belongsTo` check — the caller is the task domain.
   */
  @Transactional()
  async syncSourceStatus(
    source: AttentionSource,
    status: AttentionItemStatus,
  ): Promise<void> {
    const items = await this.findBySource(source);
    for (const item of items) {
      if (item.status === status) continue;
      item.status = status;
      const updated = await this.attentionItemsRepository.update(item);
      await this.eventsPublisher.publish(AttentionItemUpdated, {
        item: toAttentionItemResponse(updated),
      });
    }
  }

  /**
   * System-driven content sync for items mirrored from a source (used when a
   * pending suggestion's payload is edited). Rewrites title + due date in place
   * and emits `attention.updated` — avoids delete/recreate churn since there is
   * no `attention.deleted` realtime event.
   */
  @Transactional()
  async syncSourceContent(
    source: AttentionSource,
    patch: { title: string; dueDate: Date | null },
  ): Promise<void> {
    const items = await this.findBySource(source);
    for (const item of items) {
      const metadata = { ...item.metadata, title: patch.title };
      await this.attentionItemsRepository.updateContent(
        item.id,
        metadata,
        patch.dueDate,
      );
      const updated = await this.attentionItemsRepository.getById(item.id);
      if (updated) {
        await this.eventsPublisher.publish(AttentionItemUpdated, {
          item: toAttentionItemResponse(updated),
        });
      }
    }
  }

  /** Soft-delete every attention item mirrored from a source (e.g. on delete or untag). */
  @Transactional()
  async deleteBySource(source: AttentionSource): Promise<void> {
    const items = await this.findBySource(source);
    for (const item of items) {
      await this.attentionItemsRepository.softDelete(item.id);
    }
  }

  private findBySource(source: AttentionSource): Promise<AttentionItem[]> {
    if ("taskId" in source) {
      return this.attentionItemsRepository.findByTaskId(source.taskId);
    }
    if ("taskBatchId" in source) {
      return this.attentionItemsRepository.findByTaskBatchId(
        source.taskBatchId,
      );
    }
    return this.attentionItemsRepository.findBySuggestionId(
      source.suggestionId,
    );
  }

  @Transactional()
  async deleteAttentionItem(userId: string, id: string): Promise<void> {
    const item = await this.attentionItemsRepository.getById(id);
    if (!item || item.isDeleted || !item.belongsTo(userId)) {
      throw AsksynkError.notFound("Attention item not found");
    }
    await this.attentionItemsRepository.softDelete(id);
  }
}
