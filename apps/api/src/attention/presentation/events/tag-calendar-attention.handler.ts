import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";
import _ from "lodash";
import { ContextLogger } from "nestjs-context-logger";

import { AttentionDueDateService } from "@/api/attention/application/attention-due-date.service";
import { AttentionProjectionService } from "@/api/attention/application/attention-projection.service";
import { AttentionItem } from "@/api/attention/domain/attention-item";
import { AttentionItemsRepository } from "@/api/attention/domain/ports/attention-items.repository";
import { AttentionItemsConsumerGroup } from "@/api/attention/presentation/events/attention-items.consumer-group";
import { EventHandler } from "@/api/platform/events/decorators/event-handler.decorator";
import {
  CalendarEventCreated,
  CalendarEventDeleted,
  CalendarEventUpdated,
  TagDeleted,
  TagUpdated,
} from "@/api/platform/events/registry/events.registry";
import { EventOf } from "@/api/platform/events/registry/events.types";
import { TagCatalogPort } from "@/api/tagging/contract/tag-catalog.port";

// Cross-cutting: tag and calendar changes recompute due dates for ANY affected
// attention item regardless of source, and clean up items orphaned by a
// deleted tag. Generic by design — no per-source behavior.
@Injectable()
export class TagCalendarAttentionHandler {
  private readonly logger = new ContextLogger(TagCalendarAttentionHandler.name);

  constructor(
    private readonly attentionItemsRepository: AttentionItemsRepository,
    private readonly projection: AttentionProjectionService,
    private readonly tagCatalog: TagCatalogPort,
    private readonly dueDateService: AttentionDueDateService,
  ) {}

  @EventHandler(CalendarEventCreated, AttentionItemsConsumerGroup)
  @Transactional()
  async onCalendarEventCreated(
    payload: EventOf<typeof CalendarEventCreated>,
  ): Promise<void> {
    if (_.isEmpty(payload.tagIds)) {
      return;
    }
    const items = await this.attentionItemsRepository.findByTagIds(
      payload.tagIds!,
    );
    await this.dueDateService.recomputeForItems(items);
  }

  @EventHandler(CalendarEventUpdated, AttentionItemsConsumerGroup)
  @Transactional()
  async onCalendarEventUpdated(
    payload: EventOf<typeof CalendarEventUpdated>,
  ): Promise<void> {
    const items = await this.collectItemsBySourceOrTags(
      payload.eventId,
      payload.tagIds || [],
    );

    await this.dueDateService.recomputeForItems(items);
  }

  @EventHandler(CalendarEventDeleted, AttentionItemsConsumerGroup)
  @Transactional()
  async onCalendarEventDeleted(
    payload: EventOf<typeof CalendarEventDeleted>,
  ): Promise<void> {
    const items = await this.attentionItemsRepository.findByDueSourceEventId(
      payload.eventId,
    );

    await this.dueDateService.recomputeForItems(items);
  }

  @EventHandler(TagUpdated, AttentionItemsConsumerGroup)
  @Transactional()
  async onTagUpdated(payload: EventOf<typeof TagUpdated>): Promise<void> {
    const affectedItems = await this.attentionItemsRepository.findByTagIds([
      payload.id,
    ]);
    if (affectedItems.length === 0) return;

    // Tag may already be gone (deleted after update); TagDeleted handles that.
    const [answerMode] = await this.tagCatalog.getAnswerModes([payload.id]);
    if (!answerMode) return;

    await this.dueDateService.recomputeForItems(affectedItems);
  }

  @EventHandler(TagDeleted, AttentionItemsConsumerGroup)
  @Transactional()
  async onTagDeleted(payload: EventOf<typeof TagDeleted>): Promise<void> {
    this.logger.info(
      `Handling TagDeleted event for tag ${payload.tagId}; checking for associated attention items...`,
    );

    const items = await this.attentionItemsRepository.findByTagIds([
      payload.tagId,
    ]);

    // item.tagIds already excludes the deleted tag (ghost-filtered by repo). The
    // source's tag rows cascade without an event, so an item left untagged is
    // removed here, as an untag would; resolved items stay.
    const untagged = items.filter(
      (i) => i.tagIds.length === 0 && i.status !== "resolved",
    );
    const remaining = items.filter((i) => i.tagIds.length > 0);

    for (const item of untagged) {
      await this.projection.remove(item.userId, item.source);
    }

    await this.dueDateService.recomputeForItems(remaining);

    await this.attentionItemsRepository.deleteTagAssociations(payload.tagId);
  }

  private async collectItemsBySourceOrTags(
    eventId: string,
    tagIds: string[],
  ): Promise<AttentionItem[]> {
    const [bySource, byTags] = await Promise.all([
      this.attentionItemsRepository.findByDueSourceEventId(eventId),
      tagIds.length > 0
        ? this.attentionItemsRepository.findByTagIds(tagIds)
        : Promise.resolve<AttentionItem[]>([]),
    ]);

    const merged = new Map<string, AttentionItem>();

    for (const item of [...bySource, ...byTags]) {
      merged.set(item.id, item);
    }

    return [...merged.values()];
  }
}
