import { Module } from "@nestjs/common";

import { EventsDeadLettersModule } from "@/api/platform/events/dead-letters/events-dead-letters.module";
import { EventsOutboxRepository } from "@/api/platform/events/outbox/events-outbox.repository";
import { EventsRetentionJobHandler } from "@/api/platform/events/retention/events-retention.job-handler";

/** Job discovery is app-wide; the handler only needs to be a provider. */
@Module({
  imports: [EventsDeadLettersModule],
  providers: [EventsRetentionJobHandler, EventsOutboxRepository],
})
export class EventsRetentionModule {}
