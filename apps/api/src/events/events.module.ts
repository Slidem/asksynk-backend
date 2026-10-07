import { Module } from "@nestjs/common";

import { EventDeadLettersAdminController } from "@/api/events/rest/event-dead-letters.admin.controller";
import { DB_CLIENT_PROVIDER } from "@/api/platform/db/db.module";
import { EventConsumerModule } from "@/api/platform/events/consumer/event-consumer.module";
import { EventsConsumerDb } from "@/api/platform/events/consumer/realtime-listener.service";
import { EventsDeadLettersModule } from "@/api/platform/events/dead-letters/events-dead-letters.module";
import { EventsDispatcherModule } from "@/api/platform/events/dispatcher/events-dispatcher.module";
import { EventsRetentionModule } from "@/api/platform/events/retention/events-retention.module";

@Module({
  imports: [
    // Consumer scans for event handlers and listens for realtime or message buss events and dispatches them to the appropriate handlers.
    EventConsumerModule.forRootAsync({
      inject: [DB_CLIENT_PROVIDER],
      useFactory: (db: EventsConsumerDb) => db,
    }),

    // Dispatcher reads the outbox table and dispatches events via the message buss. Message buss should be a message queue implementation that supports delayed messages, retries, competitive consumers, and dead letter queues;
    EventsDispatcherModule.forRootAsync({
      inject: [DB_CLIENT_PROVIDER],
      useFactory: (db: EventsConsumerDb) => db,
    }),

    // Daily cron pruning old outbox rows and resolved dead letters.
    EventsRetentionModule,

    // Admin API: list, replay and discard dead letters.
    EventsDeadLettersModule,
  ],
  controllers: [EventDeadLettersAdminController],
  providers: [],
})
export class EventsModule {}
