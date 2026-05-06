import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { eventsOutbox } from "@/migrations/schema/outbox";
import { EmailModule } from "@/shared/email/email.module";
import { EventConsumerModule } from "@/shared/event-consumer/event-consumer.module";
import { EventsConsumerDb } from "@/shared/event-consumer/realtime-listener.service";
import { EventsDispatcherDb } from "@/shared/event-dispatcher/events-dispatcher";
import { EventsDispatcherModule } from "@/shared/event-dispatcher/events-dispatcher.module";
import { LoggerConfigModule } from "@/shared/logger.config";
import { MessageBusModule } from "@/shared/message-bus/message-bus.module";

import { TagNotificationsService } from "../services/tag-notifications.service";

const dbFactory = (config: ConfigService) => {
  const pool = new Pool({
    connectionString: config.getOrThrow<string>("DATABASE_URL"),
    min: config.get<number>("DB_POOL_MIN") ?? 1,
    max: config.get<number>("DB_POOL_MAX") ?? 5,
  });
  return drizzle(pool, { schema: { eventsOutbox } });
};

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerConfigModule,
    EmailModule,
    EventConsumerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): EventsConsumerDb => dbFactory(config),
    }),
    MessageBusModule,
    EventsDispatcherModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): EventsDispatcherDb =>
        dbFactory(config),
    }),
  ],
  providers: [TagNotificationsService],
})
export class AppModule {}
