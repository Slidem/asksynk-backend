import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";
import _ from "lodash";
import { ContextLogger } from "nestjs-context-logger";

import { AttentionDueDateService } from "@/api/attention-items/attention-due-date.service";
import { AttentionItemsRepository } from "@/api/attention-items/attention-items.repository";
import { AttentionItemsService } from "@/api/attention-items/attention-items.service";
import { TaggedMessageMetadata } from "@/api/attention-items/models/attention-item.model";
import { EventHandler } from "@/shared/event-consumer/event-consumer.decorator";
import {
  MessageCreated,
  MessageManagedStatusChanged,
  MessageUpdated,
} from "@/shared/event-registry/events.registry";
import { EventOf } from "@/shared/event-registry/events.types";
import { generateId } from "@/shared/id";

// Mirrors tagged in-app messages into one attention item per recipient.
@Injectable()
export class MessageAttentionHandler {
  private readonly logger = new ContextLogger(MessageAttentionHandler.name);

  constructor(
    private readonly attentionItemsRepository: AttentionItemsRepository,
    private readonly attentionItemsService: AttentionItemsService,
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
        await this.attentionItemsService.softDeleteAndNotify(
          item.id,
          item.userId,
        );
      }
      return;
    }

    for (const item of existing) {
      item.tagIds = message.tagIds;
      await this.attentionItemsRepository.update(item);
    }

    await this.dueDateService.recomputeForItems(existing);
  }

  // Forward sync: the recipient changed a tagged message's managed_status →
  // mirror it onto the linked attention item(s). syncSourceStatus is idempotent,
  // so a re-published event (from the reverse path) no-ops here.
  @Transactional()
  @EventHandler(MessageManagedStatusChanged, { group: "attention-items" })
  async onMessageManagedStatusChanged(
    payload: EventOf<typeof MessageManagedStatusChanged>,
  ): Promise<void> {
    await this.attentionItemsService.syncSourceStatus(
      { messageId: payload.messageId },
      payload.managedStatus.status,
    );
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
}
