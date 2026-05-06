import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { eventsOutbox } from "@/migrations/schema/outbox";
import { EmailModule } from "@/shared/email/email.module";
import { EventConsumerModule } from "@/shared/event-consumer/event-consumer.module";
import { EventsDispatcherDb } from "@/shared/event-dispatcher/events-dispatcher";
import { EventsDispatcherModule } from "@/shared/event-dispatcher/events-dispatcher.module";
import { LoggerConfigModule } from "@/shared/logger.config";
import { MessageBusModule } from "@/shared/message-bus/message-bus.module";

import { TagCreatedHandler } from "../services/tag-created.handler";
import { TagUpdatedHandler } from "../services/tag-updated.handler";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerConfigModule,
    EmailModule,
    EventConsumerModule,
    MessageBusModule,
    EventsDispatcherModule.forRootAsync({
      inject: [ConfigService],
      // Most likely we will need to extract the pool into a separate module when we add repositories in the worker, to avoid creating multiple pools.
      // For now it's fine since we only have the dispatcher accessing the db, and it will reuse the same pool for the listen and poll clients.
      useFactory: (config: ConfigService): EventsDispatcherDb => {
        const pool = new Pool({
          connectionString: config.getOrThrow<string>("DATABASE_URL"),
          min: config.get<number>("DB_POOL_MIN") ?? 1,
          max: config.get<number>("DB_POOL_MAX") ?? 5,
        });
        return drizzle(pool, { schema: { eventsOutbox } });
      },
    }),
  ],
  providers: [TagCreatedHandler, TagUpdatedHandler],
})
export class AppModule {}
