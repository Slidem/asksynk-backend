import { Injectable } from "@nestjs/common";
import { EventHandler } from "src/platform/events/consumer/event-consumer.decorator";
import {
  CalendarEventCreated,
  CalendarEventDeleted,
  CalendarEventUpdated,
} from "src/platform/events/registry/events.registry";
import { EventOf } from "src/platform/events/registry/events.types";

import { CalendarOutboundSyncService } from "@/api/calendar-integrations/services/calendar-outbound-sync.service";

/**
 * Durable consumer (group `calendar-sync`) that mirrors native asksynk events to
 * external providers. Exactly-once + failover across instances via pg-boss.
 */
@Injectable()
export class CalendarSyncEventHandler {
  constructor(private readonly outbound: CalendarOutboundSyncService) {}

  @EventHandler(CalendarEventCreated, { group: "calendar-sync" })
  async onCreated(
    payload: EventOf<typeof CalendarEventCreated>,
  ): Promise<void> {
    await this.outbound.mirrorEvent(payload.eventId, payload.userId);
  }

  @EventHandler(CalendarEventUpdated, { group: "calendar-sync" })
  async onUpdated(
    payload: EventOf<typeof CalendarEventUpdated>,
  ): Promise<void> {
    await this.outbound.mirrorEvent(payload.eventId, payload.userId);
  }

  @EventHandler(CalendarEventDeleted, { group: "calendar-sync" })
  async onDeleted(
    payload: EventOf<typeof CalendarEventDeleted>,
  ): Promise<void> {
    await this.outbound.deleteMirrors(payload.eventId);
  }
}
