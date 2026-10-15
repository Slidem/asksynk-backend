import { Injectable } from "@nestjs/common";

import { EventHandler } from "@/api/platform/events/decorators/event-handler.decorator";
import {
  AttentionItemRemoved,
  AttentionItemUpserted,
} from "@/api/platform/events/registry/events.registry";
import { EventOf } from "@/api/platform/events/registry/events.types";
import { RealtimeBroadcaster } from "@/api/platform/realtime/realtime-broadcaster";

@Injectable()
export class AttentionBroadcaster {
  constructor(private readonly broadcaster: RealtimeBroadcaster) {}

  @EventHandler(AttentionItemUpserted)
  async onAttentionItemUpserted(
    payload: EventOf<typeof AttentionItemUpserted>,
  ): Promise<void> {
    this.broadcaster.emit(
      [{ kind: "user", id: payload.item.userId }],
      "attention.upserted",
      { item: payload.item },
    );
  }

  @EventHandler(AttentionItemRemoved)
  async onAttentionItemRemoved(
    payload: EventOf<typeof AttentionItemRemoved>,
  ): Promise<void> {
    this.broadcaster.emit(
      [{ kind: "user", id: payload.userId }],
      "attention.removed",
      { id: payload.id },
    );
  }
}
