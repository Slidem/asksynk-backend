import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { MessagingService } from "@/api/messaging/services/messaging.service";
import { EventHandler } from "@/api/platform/events/decorators/event-handler.decorator";
import { MessagingConsumerGroup } from "@/api/messaging/messaging.consumer-group";
import { AttentionMessageStatusChanged } from "@/api/platform/events/registry/events.registry";
import { EventOf } from "@/api/platform/events/registry/events.types";

// Reverse sync: a tagged_message attention item resolved from the inbox →
// reflect its status back onto the linked message.
@Injectable()
export class AttentionMessageHandler {
  constructor(private readonly messagingService: MessagingService) {}

  @Transactional()
  @EventHandler(AttentionMessageStatusChanged, MessagingConsumerGroup)
  async onAttentionStatusChanged(
    payload: EventOf<typeof AttentionMessageStatusChanged>,
  ): Promise<void> {
    await this.messagingService.applyManagedStatusFromAttention(
      payload.userId,
      payload.messageId,
      payload.status,
    );
  }
}
