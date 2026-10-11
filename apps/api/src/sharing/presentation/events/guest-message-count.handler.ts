import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { EventHandler } from "@/api/platform/events/decorators/event-handler.decorator";
import { MessageCreated } from "@/api/platform/events/registry/events.registry";
import { EventOf } from "@/api/platform/events/registry/events.types";
import { PublicViewGuestsRepository } from "@/api/sharing/domain/ports/public-view-guests.repository";
import { PublicViewsConsumerGroup } from "@/api/sharing/presentation/events/public-views.consumer-group";

/**
 * Keeps `public_view_guests.message_count` (messages a guest sent). A guest message is
 * published once — to the link owner. Redelivery is absorbed by the repository's
 * `last_counted_message_id` watermark; the group orders events per sender.
 */
@Injectable()
export class GuestMessageCountHandler {
  constructor(
    private readonly publicViewGuestsRepository: PublicViewGuestsRepository,
  ) {}

  @Transactional()
  @EventHandler(MessageCreated, PublicViewsConsumerGroup)
  async onMessageCreated(
    payload: EventOf<typeof MessageCreated>,
  ): Promise<void> {
    if (payload.message.senderKind !== "guest" || !payload.sentToUserId) {
      return;
    }
    await this.publicViewGuestsRepository.countMessage(
      payload.message.senderId,
      payload.message.id,
    );
  }
}
