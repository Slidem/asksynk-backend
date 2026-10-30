import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { AttentionDueDateService } from "@/api/attention/application/attention-due-date.service";
import { toAttentionItemView } from "@/api/attention/application/read/attention-item.view";
import {
  AttentionItem,
  AttentionSource,
} from "@/api/attention/domain/attention-item";
import {
  applySnapshot,
  AttentionSourceSnapshot,
} from "@/api/attention/domain/attention-projection";
import { AttentionItemsRepository } from "@/api/attention/domain/ports/attention-items.repository";
import { Clock } from "@/api/platform/clock/clock";
import { EventsPublisher } from "@/api/platform/events/publisher/events-publisher";
import {
  AttentionItemRemoved,
  AttentionItemResolved,
  AttentionItemUpserted,
} from "@/api/platform/events/registry/events.registry";

// Orchestration only: the projection rules live in `applySnapshot`. Writes are
// serialized per user by the attention-items consumer group.
@Injectable()
export class AttentionProjectionService {
  constructor(
    private readonly attentionItemsRepository: AttentionItemsRepository,
    private readonly dueDates: AttentionDueDateService,
    private readonly eventsPublisher: EventsPublisher,
    private readonly clock: Clock,
  ) {}

  @Transactional()
  async upsert(snapshot: AttentionSourceSnapshot): Promise<void> {
    const current = await this.attentionItemsRepository.findBySource(
      snapshot.userId,
      snapshot.source,
    );
    const decision = snapshot.dueDate
      ? { dueDate: null, dueSourceEventId: null }
      : await this.dueDates.decide(snapshot.tagIds, snapshot.occurredAt);

    const next = applySnapshot(current, snapshot, decision);
    if (!next) return;

    const saved = await this.attentionItemsRepository.upsert(next);
    if (!saved) return; // tombstoned concurrently by the user

    await this.eventsPublisher.publish(AttentionItemUpserted, {
      item: toAttentionItemView(saved),
    });

    if (saved.status === "resolved" && current?.status !== "resolved") {
      await this.publishResolved(saved);
    }
  }

  /** The source no longer projects an item: hard-delete it unless tombstoned. */
  @Transactional()
  async remove(userId: string, source: AttentionSource): Promise<void> {
    const id = await this.attentionItemsRepository.deleteLiveBySource(
      userId,
      source,
    );
    if (id) {
      await this.eventsPublisher.publish(AttentionItemRemoved, { id, userId });
    }
  }

  private async publishResolved(item: AttentionItem): Promise<void> {
    const resolvedAt = this.clock.now();
    await this.eventsPublisher.publish(AttentionItemResolved, {
      userId: item.userId,
      itemId: item.id,
      resolvedAt: resolvedAt.toISOString(),
      dueDate: item.dueDate ? item.dueDate.toISOString() : null,
      wasOverdue: item.dueDate !== null && item.dueDate < resolvedAt,
    });
  }
}
