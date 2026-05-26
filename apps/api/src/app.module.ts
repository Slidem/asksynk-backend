import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";

import { AttentionItemsModule } from "@/api/attention-items/attention-items.module";
import { AuthController } from "@/api/auth/auth.controller";
import { AuthGuardModule } from "@/api/auth/authGuard.module";
import { CalendarEventsModule } from "@/api/calendar-events/calendar-events.module";
import { AllExceptionsFilter } from "@/api/common/errors/errors.filter";
import { LoggerConfigModule } from "@/api/common/logger/logger.config";
import { HealthController } from "@/api/health/health.controller";
import { DbModule } from "@/api/infrastructure/db/db.module";
import { TxModule } from "@/api/infrastructure/db/tx.module";
import { MessagingModule } from "@/api/messaging/messaging.module";
import { NetworksModule } from "@/api/networks/networks.module";
import { PublicViewsModule } from "@/api/public-views/public-views.module";
import { RealtimeModule } from "@/api/realtime/ws.module";
import { TagsModule } from "@/api/tags/tags.module";

import { EventsModule } from "./events/events.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerConfigModule,
    DbModule,
    TxModule,
    AttentionItemsModule,
    TagsModule,
    CalendarEventsModule,
    NetworksModule,
    PublicViewsModule,
    MessagingModule,
    RealtimeModule,
    AuthGuardModule,
    EventsModule,
  ],
  controllers: [HealthController, AuthController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
