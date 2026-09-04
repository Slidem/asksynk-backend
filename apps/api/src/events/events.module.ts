import { Module } from "@nestjs/common";

import { DB_CLIENT_PROVIDER } from "@/api/platform/db/db.module";
import { EventConsumerModule } from "@/api/platform/events/consumer/event-consumer.module";
import { EventsConsumerDb } from "@/api/platform/events/consumer/realtime-listener.service";
import { EventsDispatcherModule } from "@/api/platform/events/dispatcher/events-dispatcher.module";

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
  ],
  providers: [],
})
export class EventsModule {}
