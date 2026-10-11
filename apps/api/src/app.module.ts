import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AttentionModule } from "@/api/attention/attention.module";
import { AuthGuardModule } from "@/api/auth/auth-guard.module";
import { AuthController } from "@/api/auth/presentation/rest/auth.controller";
import { ConversationsModule } from "@/api/conversations/conversations.module";
import { ERROR_CATALOGUES } from "@/api/error-catalogs.root";
import { EventsModule } from "@/api/events/events.module";
import { FilesModule } from "@/api/files/files.module";
import { FocusModule } from "@/api/focus/focus.module";
import { HealthController } from "@/api/health/health.controller";
import { NetworkModule } from "@/api/network/network.module";
import { ClockModule } from "@/api/platform/clock/clock.module";
import { DbModule } from "@/api/platform/db/db.module";
import { TxModule } from "@/api/platform/db/tx.module";
import { ErrorsModule } from "@/api/platform/errors/errors.module";
import { LoggerConfigModule } from "@/api/platform/logger/logger.config";
import { SchedulingModule } from "@/api/scheduling/scheduling.module";
import { SharingModule } from "@/api/sharing/sharing.module";
import { TaggingModule } from "@/api/tagging/tagging.module";
import { TasksModule } from "@/api/tasks/tasks.module";
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
    AttentionModule,
    TaggingModule,
    TasksModule,
    SchedulingModule,
    NetworkModule,
    SharingModule,
    FilesModule,
    ConversationsModule,
    WebsocketsModule,
    AuthGuardModule,
    EventsModule,
    FocusModule,
    UserProfileModule,
    UserSettingsModule,
  ],
  controllers: [HealthController, AuthController],
})
export class AppModule {}
