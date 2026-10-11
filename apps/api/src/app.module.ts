import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AttentionItemsModule } from "@/api/attention-items/attention-items.module";
import { AuthController } from "@/api/auth/auth.controller";
import { AuthGuardModule } from "@/api/auth/authGuard.module";
import { ERROR_CATALOGUES } from "@/api/error-catalogs.root";
import { EventsModule } from "@/api/events/events.module";
import { HealthController } from "@/api/health/health.controller";
import { MessagingModule } from "@/api/messaging/messaging.module";
import { NetworksModule } from "@/api/networks/networks.module";
import { ClockModule } from "@/api/platform/clock/clock.module";
import { DbModule } from "@/api/platform/db/db.module";
import { TxModule } from "@/api/platform/db/tx.module";
import { ErrorsModule } from "@/api/platform/errors/errors.module";
import { LoggerConfigModule } from "@/api/platform/logger/logger.config";
import { PublicViewsModule } from "@/api/public-views/public-views.module";
import { CalendarIntegrationsModule } from "@/api/scheduling/calendar-integrations.module";
import { SchedulingModule } from "@/api/scheduling/scheduling.module";
import { StorageModule } from "@/api/storage/storage.module";
import { TaggingModule } from "@/api/tagging/tagging.module";
import { TasksModule } from "@/api/tasks/tasks.module";
import { TimersModule } from "@/api/timers/timers.module";
import { UserProfileModule } from "@/api/user-profile/user-profile.module";
import { UserSettingsModule } from "@/api/user-settings/user-settings.module";
import { WebsocketsModule } from "@/api/websockets/ws.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ErrorsModule.forRoot(ERROR_CATALOGUES),
    LoggerConfigModule,
    ClockModule,
    DbModule,
    TxModule,
    AttentionItemsModule,
    TaggingModule,
    TasksModule,
    SchedulingModule,
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
})
export class AppModule {}
