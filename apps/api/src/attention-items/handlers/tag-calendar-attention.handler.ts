import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";
import _ from "lodash";
import { ContextLogger } from "nestjs-context-logger";

import { AttentionDueDateService } from "@/api/attention-items/attention-due-date.service";
import { AttentionItemsRepository } from "@/api/attention-items/attention-items.repository";
import { AttentionItemsService } from "@/api/attention-items/attention-items.service";
import { AttentionItem } from "@/api/attention-items/entities/attention-item.entity";
import { TagRepository } from "@/api/tags/repositories/tags.repository";
import { EventHandler } from "@/shared/event-consumer/event-consumer.decorator";
import {
  CalendarEventCreated,
  CalendarEventDeleted,
  CalendarEventUpdated,
  TagDeleted,
  TagUpdated,
} from "@/shared/event-registry/events.registry";
import { EventOf } from "@/shared/event-registry/events.types";

// Cross-cutting: tag and calendar changes recompute due dates for ANY affected
// attention item regardless of source type, and clean up items orphaned by a
// deleted tag. Generic by design — no per-type behavior.
@Injectable()
export class TagCalendarAttentionHandler {
  private readonly logger = new ContextLogger(TagCalendarAttentionHandler.name);

  constructor(
    private readonly attentionItemsRepository: AttentionItemsRepository,
    private readonly attentionItemsService: AttentionItemsService,
    private readonly tagRepository: TagRepository,
    private readonly dueDateService: AttentionDueDateService,
  ) {}

  @EventHandler(CalendarEventCreated, { group: "attention-items" })
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

  @EventHandler(CalendarEventUpdated, { group: "attention-items" })
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

  @EventHandler(CalendarEventDeleted, { group: "attention-items" })
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

  @EventHandler(TagUpdated, { group: "attention-items" })
  @Transactional()
  async onTagUpdated(payload: EventOf<typeof TagUpdated>): Promise<void> {
    const affectedItems = await this.attentionItemsRepository.findByTagIds([
      payload.id,
    ]);
    if (affectedItems.length === 0) return;

    const updatedTag = await this.tagRepository.getById(payload.id);
    if (!updatedTag) return;

    await this.dueDateService.recomputeForItems(affectedItems);
  }

  @EventHandler(TagDeleted, { group: "attention-items" })
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
