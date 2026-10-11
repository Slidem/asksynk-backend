import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";
import _ from "lodash";
import { ContextLogger } from "nestjs-context-logger";

import { AttentionDueDateService } from "@/api/attention/application/attention-due-date.service";
import { AttentionItemsService } from "@/api/attention/application/attention-items.service";
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
// attention item regardless of source type, and clean up items orphaned by a
// deleted tag. Generic by design — no per-type behavior.
@Injectable()
export class TagCalendarAttentionHandler {
  private readonly logger = new ContextLogger(TagCalendarAttentionHandler.name);

  constructor(
    private readonly attentionItemsRepository: AttentionItemsRepository,
    private readonly attentionItemsService: AttentionItemsService,
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
    await this.dueDateService.recomputeForItems(this.activeItems(items));
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
    const items =
      await this.attentionItemsRepository.findBySourceCalendarEventId(
        payload.eventId,
      );

    await this.dueDateService.recomputeForItems(this.activeItems(items));
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

    // item.tagIds already excludes the deleted tag (ghost-filtered by repo)
    const itemsToDelete = this.activeItems(
      items.filter((i) => i.tagIds.length === 0),
    );

    const remaining = items.filter((i) => i.tagIds.length > 0);

    await Promise.all(
      itemsToDelete.map((item) =>
        this.attentionItemsService.softDeleteAndNotify(item.id, item.userId),
      ),
    );

    await this.dueDateService.recomputeForItems(this.activeItems(remaining));

    await this.attentionItemsRepository.deleteTagAssociations(payload.tagId);
  }

  private activeItems(items: AttentionItem[]): AttentionItem[] {
    return items.filter((item) => item.status !== "resolved");
  }

  private async collectItemsBySourceOrTags(
    eventId: string,
    tagIds: string[],
  ): Promise<AttentionItem[]> {
    const [bySource, byTags] = await Promise.all([
      this.attentionItemsRepository.findBySourceCalendarEventId(eventId),
      tagIds.length > 0
        ? this.attentionItemsRepository.findByTagIds(tagIds)
        : Promise.resolve<AttentionItem[]>([]),
    ]);

    const merged = new Map<string, AttentionItem>();

    for (const item of [...bySource, ...byTags]) {
      merged.set(item.id, item);
    }

    return this.activeItems([...merged.values()]);
  }
}
