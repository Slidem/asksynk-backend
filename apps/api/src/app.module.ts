import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";

import { AttentionItemsModule } from "@/api/attention-items/attention-items.module";
import { AuthController } from "@/api/auth/auth.controller";
import { AuthGuardModule } from "@/api/auth/authGuard.module";
import { CalendarEventsModule } from "@/api/calendar-events/calendar-events.module";
import { CalendarIntegrationsModule } from "@/api/calendar-integrations/calendar-integrations.module";
import { EventsModule } from "@/api/events/events.module";
import { HealthController } from "@/api/health/health.controller";
import { MessagingModule } from "@/api/messaging/messaging.module";
import { NetworksModule } from "@/api/networks/networks.module";
import { ClockModule } from "@/api/platform/clock/clock.module";
import { DbModule } from "@/api/platform/db/db.module";
import { TxModule } from "@/api/platform/db/tx.module";
import { AllExceptionsFilter } from "@/api/platform/errors/errors.filter";
import { LoggerConfigModule } from "@/api/platform/logger/logger.config";
import { PublicViewsModule } from "@/api/public-views/public-views.module";
import { StorageModule } from "@/api/storage/storage.module";
import { TagsModule } from "@/api/tags/tags.module";
import { TasksModule } from "@/api/tasks/tasks.module";
import { TimersModule } from "@/api/timers/timers.module";
import { UserProfileModule } from "@/api/user-profile/user-profile.module";
import { UserSettingsModule } from "@/api/user-settings/user-settings.module";
import { WebsocketsModule } from "@/api/websockets/ws.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerConfigModule,
    ClockModule,
    DbModule,
    TxModule,
    AttentionItemsModule,
    TagsModule,
    TasksModule,
    CalendarEventsModule,
    CalendarIntegrationsModule,
    NetworksModule,
    PublicViewsModule,
    StorageModule,
    MessagingModule,
    WebsocketsModule,
    AuthGuardModule,
    EventsModule,
    TimersModule,
    UserProfileModule,
    UserSettingsModule,
  ],
  controllers: [HealthController, AuthController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
