import { Injectable } from "@nestjs/common";

import { AttentionProjectionService } from "@/api/attention/application/attention-projection.service";
import { AttentionItemsConsumerGroup } from "@/api/attention/presentation/events/attention-items.consumer-group";
import { EventHandler } from "@/api/platform/events/decorators/event-handler.decorator";
import {
  AttentionSourceRemoved,
  AttentionSourceUpserted,
} from "@/api/platform/events/registry/events.registry";
import { EventOf } from "@/api/platform/events/registry/events.types";

// The one ingestion point for every source (attention's published language).
@Injectable()
export class AttentionSourceHandler {
  constructor(private readonly projection: AttentionProjectionService) {}

  @EventHandler(AttentionSourceUpserted, AttentionItemsConsumerGroup)
  async onUpserted(
    payload: EventOf<typeof AttentionSourceUpserted>,
  ): Promise<void> {
    await this.projection.upsert({
      userId: payload.userId,
      source: payload.source,
      preview: payload.preview,
      tagIds: payload.tagIds,
      status: payload.status,
      dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
      occurredAt: new Date(payload.occurredAt),
    });
  }

  @EventHandler(AttentionSourceRemoved, AttentionItemsConsumerGroup)
  async onRemoved(
    payload: EventOf<typeof AttentionSourceRemoved>,
  ): Promise<void> {
    await this.projection.remove(payload.userId, payload.source);
  }
}
