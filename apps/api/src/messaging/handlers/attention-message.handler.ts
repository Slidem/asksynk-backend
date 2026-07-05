import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { MessagingService } from "@/api/messaging/services/messaging.service";
import { EventHandler } from "@/shared/event-consumer/event-consumer.decorator";
import { AttentionMessageStatusChanged } from "@/shared/event-registry/events.registry";
import { EventOf } from "@/shared/event-registry/events.types";

// Reverse sync: a tagged_message attention item resolved from the inbox →
// reflect its status back onto the linked message.
@Injectable()
export class AttentionMessageHandler {
  constructor(private readonly messagingService: MessagingService) {}

  @Transactional()
  @EventHandler(AttentionMessageStatusChanged, { group: "messaging" })
  async onAttentionStatusChanged(
    payload: EventOf<typeof AttentionMessageStatusChanged>,
  ): Promise<void> {
    await this.messagingService.applyManagedStatusFromAttention(
      payload.messageId,
      payload.status,
    );
  }
}
