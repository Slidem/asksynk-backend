import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";
import _ from "lodash";
import { ContextLogger } from "nestjs-context-logger";

import { AttentionDueDateService } from "@/api/attention-items/attention-due-date.service";
import { AttentionItemsRepository } from "@/api/attention-items/attention-items.repository";
import { AttentionItemsService } from "@/api/attention-items/attention-items.service";
import { AttentionItem } from "@/api/attention-items/entities/attention-item.entity";
import { TaggedMessageMetadata } from "@/api/attention-items/models/attention-item.model";
import { TagRepository } from "@/api/tags/repositories/tags.repository";
import { EventHandler } from "@/shared/event-consumer/event-consumer.decorator";
import {
  CalendarEventCreated,
  CalendarEventDeleted,
  CalendarEventUpdated,
  MessageCreated,
  MessageUpdated,
  TagDeleted,
  TagUpdated,
} from "@/shared/event-registry/events.registry";
import { EventOf } from "@/shared/event-registry/events.types";
import { generateId } from "@/shared/id";

@Injectable()
export class AttentionItemsEventHandler {
  private readonly logger = new ContextLogger(AttentionItemsEventHandler.name);

  constructor(
    private readonly attentionItemsRepository: AttentionItemsRepository,
    private readonly attentionItemsService: AttentionItemsService,
    private readonly tagRepository: TagRepository,
    private readonly dueDateService: AttentionDueDateService,
  ) {}

  @Transactional()
  @EventHandler(MessageCreated, { group: "attention-items" })
  async onMessageCreated(
    payload: EventOf<typeof MessageCreated>,
  ): Promise<void> {
    if (_.isEmpty(payload.message.tagIds)) {
      return;
    }

    this.logger.info(
      `Handling MessageCreated event for message ${payload.message.id} with tags [${payload.message.tagIds!.join(
        ", ",
      )}]`,
    );

    const { message, participantUserIds } = payload;

    await this.createAttentionItemsForMessage(message, participantUserIds);
  }

  @Transactional()
  @EventHandler(MessageUpdated, { group: "attention-items" })
  async onMessageUpdated(
    payload: EventOf<typeof MessageUpdated>,
  ): Promise<void> {
    const { message, participantUserIds } = payload;

    if (message.tagIds === undefined) {
      return;
    }

    this.logger.info(
      `Handling MessageUpdated event for message ${message.id} with tags [${message.tagIds.join(
        ", ",
      )}]`,
    );

    const existing = await this.attentionItemsRepository.findByMessageId(
      message.id,
    );

    if (existing.length === 0) {
      if (message.tagIds.length === 0) {
        return;
      }
      await this.createAttentionItemsForMessage(message, participantUserIds);
      return;
    }

    if (message.tagIds.length === 0) {
      for (const item of existing) {
        await this.attentionItemsRepository.softDelete(item.id);
      }
      return;
    }

    for (const item of existing) {
      item.tagIds = message.tagIds;
      await this.attentionItemsRepository.update(item);
    }

    await this.dueDateService.recomputeForItems(existing);
  }

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
        this.attentionItemsRepository.softDelete(item.id),
      ),
    );

    await this.dueDateService.recomputeForItems(this.activeItems(remaining));

    await this.attentionItemsRepository.deleteTagAssociations(payload.tagId);
  }

  private async createAttentionItemsForMessage(
    message: {
      id: string;
      threadId: string;
      senderKind: "user" | "guest";
      senderId: string;
      body: string;
      tagIds?: string[];
      createdAt: string;
    },
    participantUserIds: string[],
  ): Promise<void> {
    if (_.isEmpty(message.tagIds)) {
      return;
    }

    const recipientUserIds = participantUserIds.filter(
      (id) => !(message.senderKind === "user" && id === message.senderId),
    );

    if (recipientUserIds.length === 0) {
      return;
    }

    const tagIds = message.tagIds!;
    const sentAt = new Date(message.createdAt);

    const metadata: TaggedMessageMetadata = {
      type: "tagged_message",
      messageId: message.id,
      threadId: message.threadId,
      senderId: message.senderId,
      senderType: message.senderKind,
      content: message.body,
      originalTagIds: tagIds,
    };

    const { dueDate, sourceCalendarEventId } =
      await this.dueDateService.deriveFromTags(tagIds, sentAt);

    for (const userId of recipientUserIds) {
      this.logger.info(
        `Creating attention item for user ${userId} based on message ${message.id}`,
      );

      await this.attentionItemsService.create({
        id: generateId(),
        userId,
        type: "tagged_message",
        dueDate,
        metadata,
        tagIds,
        sourceCalendarEventId,
      });
    }
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
