import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { attentionItemError } from "@/api/attention/attention.errors";
import {
  AttentionItem,
  ListAttentionItemsInput,
} from "@/api/attention/domain/attention-item";
import { AttentionItemsRepository } from "@/api/attention/domain/ports/attention-items.repository";
import { Actor } from "@/api/kernel/actor/actor";
import { EventsPublisher } from "@/api/platform/events/publisher/events-publisher";
import { AttentionItemRemoved } from "@/api/platform/events/registry/events.registry";

// The user's side of attention: read and delete. Items change only by projection.
@Injectable()
export class AttentionItemsService {
  constructor(
    private readonly attentionItemsRepository: AttentionItemsRepository,
    private readonly eventsPublisher: EventsPublisher,
  ) {}

  @Transactional()
  async getAttentionItem(actor: Actor, id: string): Promise<AttentionItem> {
    return this.requireOwned(actor, id);
  }

  @Transactional()
  async listAttentionItems(
    actor: Actor,
    input: ListAttentionItemsInput,
  ): Promise<AttentionItem[]> {
    return this.attentionItemsRepository.listByUserId(
      this.userIdOf(actor),
      input,
    );
  }

  /** Tombstones the item; no later source event revives it. */
  @Transactional()
  async deleteAttentionItem(actor: Actor, id: string): Promise<void> {
    const item = await this.requireOwned(actor, id);
    await this.attentionItemsRepository.softDelete(id);
    await this.eventsPublisher.publish(AttentionItemRemoved, {
      id,
      userId: item.userId,
    });
  }

  private async requireOwned(actor: Actor, id: string): Promise<AttentionItem> {
    const item = await this.attentionItemsRepository.getById(id);
    if (!item || item.isDeleted || !item.belongsTo(this.userIdOf(actor))) {
      throw attentionItemError("item_not_found", { id });
    }
    return item;
  }

  private userIdOf(actor: Actor): string {
    if (actor.kind === "guest") {
      throw attentionItemError("guest_not_allowed");
    }
    return actor.userId;
  }
}
