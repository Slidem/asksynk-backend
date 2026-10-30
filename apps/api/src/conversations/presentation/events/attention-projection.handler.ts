import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import {
  AttentionProjection,
  fromMessageEvent,
  fromMessageStatusChanged,
} from "@/api/conversations/application/attention-projection.mapper";
import { ConversationsAttentionProjectionConsumerGroup } from "@/api/conversations/presentation/events/attention-projection.consumer-group";
import { EventHandler } from "@/api/platform/events/decorators/event-handler.decorator";
import { EventsPublisher } from "@/api/platform/events/publisher/events-publisher";
import {
  AttentionSourceRemoved,
  AttentionSourceUpserted,
  MessageCreated,
  MessageManagedStatusChanged,
  MessageUpdated,
} from "@/api/platform/events/registry/events.registry";
import { EventOf } from "@/api/platform/events/registry/events.types";

// Conversations' outbound ACL: republishes message events in attention's language.
@Injectable()
export class ConversationsAttentionProjectionHandler {
  constructor(private readonly publisher: EventsPublisher) {}

  @Transactional()
  @EventHandler(MessageCreated, ConversationsAttentionProjectionConsumerGroup)
  async onMessageCreated(p: EventOf<typeof MessageCreated>): Promise<void> {
    await this.publish(fromMessageEvent(p, false));
  }

  @Transactional()
  @EventHandler(MessageUpdated, ConversationsAttentionProjectionConsumerGroup)
  async onMessageUpdated(p: EventOf<typeof MessageUpdated>): Promise<void> {
    await this.publish(fromMessageEvent(p, true));
  }

  @Transactional()
  @EventHandler(
    MessageManagedStatusChanged,
    ConversationsAttentionProjectionConsumerGroup,
  )
  async onMessageStatusChanged(
    p: EventOf<typeof MessageManagedStatusChanged>,
  ): Promise<void> {
    const upserted = fromMessageStatusChanged(p);
    if (upserted) {
      await this.publisher.publish(AttentionSourceUpserted, upserted);
    }
  }

  private async publish(projection: AttentionProjection | null): Promise<void> {
    if (projection?.kind === "upserted") {
      await this.publisher.publish(AttentionSourceUpserted, projection.payload);
    } else if (projection?.kind === "removed") {
      await this.publisher.publish(AttentionSourceRemoved, projection.payload);
    }
  }
}
