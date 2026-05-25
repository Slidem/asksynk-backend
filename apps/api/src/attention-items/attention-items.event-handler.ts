import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";
import { ContextLogger } from "nestjs-context-logger";
import _ from "node_modules/@types/lodash";

import { AttentionItemsRepository } from "@/api/attention-items/attention-items.repository";
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
    private readonly tagRepository: TagRepository,
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

    await this.recomputeDueDatesForItems(existing);
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
    await this.recomputeDueDatesForItems(this.activeItems(items));
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

    await this.recomputeDueDatesForItems(items);
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
    await this.recomputeDueDatesForItems(this.activeItems(items));
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

    await this.recomputeDueDatesForItems(affectedItems);
  }

  @EventHandler(TagDeleted, { group: "attention-items" })
  @Transactional()
  async onTagDeleted(payload: EventOf<typeof TagDeleted>): Promise<void> {
    const items = await this.attentionItemsRepository.findByTagIds([
      payload.tagId,
    ]);

    await this.recomputeDueDatesForItems(items);
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
    const tags = await this.tagRepository.getByIds(tagIds);
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

    for (const userId of recipientUserIds) {
      this.logger.info(
        `Creating attention item for user ${userId} based on message ${message.id}`,
      );
      const { dueDate, sourceCalendarEventId } = await this.computeDueDate(
        tags,
        tagIds,
        sentAt,
      );

      await this.attentionItemsRepository.add({
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

  private async recomputeDueDatesForItems(
    items: AttentionItem[],
  ): Promise<void> {
    if (items.length === 0) return;

    const allTagIds = [...new Set(items.flatMap((i) => i.tagIds))];
    const tags = await this.tagRepository.getByIds(allTagIds);
    const tagMap = new Map(tags.map((t) => [t.id.toString(), t]));

    const timeblockTagIds = tags
      .filter((t) => t.answerMode.type === "timeblock")
      .map((t) => t.id.toString());

    const occurrenceMap =
      await this.attentionItemsRepository.findEarliestUpcomingOccurrenceForTags(
        timeblockTagIds,
        new Date(),
      );

    this.logger.info(
      `Occurrence map for recomputing due dates: ${[...occurrenceMap.entries()]
        .map(
          ([tagId, occ]) =>
            `${tagId} => ${occ.date.toISOString()} (${occ.eventId})`,
        )
        .join(", ")}`,
    );

    const updates = items.map((item) => {
      const itemTags = item.tagIds.map((id) => tagMap.get(id)).filter(Boolean);
      let dueDate: Date | null = null;
      let sourceCalendarEventId: string | null = null;

      for (const tag of itemTags) {
        if (!tag) {
          continue;
        }
        if (tag.answerMode.type === "immediately") {
          const candidate = new Date(
            item.createdAt.getTime() + tag.answerMode.responseTimeMillis,
          );
          if (!dueDate || candidate < dueDate) {
            dueDate = candidate;
            sourceCalendarEventId = null;
          }
        } else {
          const candidate = occurrenceMap.get(tag.id.toString());
          if (candidate && (!dueDate || candidate.date < dueDate)) {
            dueDate = candidate.date;
            sourceCalendarEventId = candidate.eventId;
          }
        }
      }

      return { id: item.id, dueDate, sourceCalendarEventId };
    });

    await this.attentionItemsRepository.batchUpdateDueDates(updates);
  }

  private async computeDueDate(
    tags: Awaited<ReturnType<TagRepository["getByIds"]>>,
    tagIds: string[],
    sentAt: Date,
  ): Promise<{ dueDate: Date | null; sourceCalendarEventId: string | null }> {
    let dueDate: Date | null = null;
    let sourceCalendarEventId: string | null = null;

    const timeblockTagIds = tags
      .filter((t) => t.answerMode.type === "timeblock")
      .map((t) => t.id.toString());

    const occurrenceMap =
      timeblockTagIds.length > 0
        ? await this.attentionItemsRepository.findEarliestUpcomingOccurrenceForTags(
            timeblockTagIds,
            sentAt,
          )
        : new Map<string, { date: Date; eventId: string }>();

    for (const tag of tags) {
      if (!tagIds.includes(tag.id.toString())) {
        continue;
      }

      if (tag.answerMode.type === "immediately") {
        const candidate = new Date(
          sentAt.getTime() + tag.answerMode.responseTimeMillis,
        );

        if (!dueDate || candidate < dueDate) {
          dueDate = candidate;
          sourceCalendarEventId = null;
        }
      } else {
        const candidate = occurrenceMap.get(tag.id.toString());
        if (candidate && (!dueDate || candidate.date < dueDate)) {
          dueDate = candidate.date;
          sourceCalendarEventId = candidate.eventId;
        }
      }
    }

    return { dueDate, sourceCalendarEventId };
  }
}
