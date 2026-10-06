import { Module } from "@nestjs/common";

import { EventsDeadLettersRepository } from "@/api/platform/events/dead-letters/events-dead-letters.repository";
import { EventsOutboxRepository } from "@/api/platform/events/outbox/events-outbox.repository";
import { EventsRetentionJobHandler } from "@/api/platform/events/retention/events-retention.job-handler";

/** Job discovery is app-wide; the handler only needs to be a provider. */
@Module({
  providers: [
    EventsRetentionJobHandler,
    EventsOutboxRepository,
    EventsDeadLettersRepository,
  ],
})
export class EventsRetentionModule {}
