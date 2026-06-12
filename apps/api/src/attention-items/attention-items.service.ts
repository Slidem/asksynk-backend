import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { AttentionItemsRepository } from "@/api/attention-items/attention-items.repository";
import { AttentionItem } from "@/api/attention-items/entities/attention-item.entity";
import {
  CreateAttentionItemInput,
  ListAttentionItemsInput,
  UpdateAttentionItemInput,
} from "@/api/attention-items/models/attention-item.model";
import { toAttentionItemResponse } from "@/api/attention-items/rest/attention-item.mapper";
import { AsksynkError } from "@/api/common/errors/errors.model";
import { EventsPublisher } from "@/shared/event-publisher/events-publisher";
import { AttentionItemCreated } from "@/shared/event-registry/events.registry";

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

    return this.attentionItemsRepository.update(item);
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
