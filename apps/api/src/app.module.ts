import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";

import { AuthController } from "@/api/auth/auth.controller";
import { AuthGuardModule } from "@/api/auth/authGuard.module";
import { AllExceptionsFilter } from "@/api/common/errors/errors.filter";
import { LoggerConfigModule } from "@/api/common/logger/logger.config";
import { EventsModule } from "@/api/events/events.module";
import { HealthController } from "@/api/health/health.controller";
import { DbModule } from "@/api/infrastructure/db/db.module";
import { TxModule } from "@/api/infrastructure/db/tx.module";
import { NatsModule } from "@/api/infrastructure/nats/nats.module";
import { TagsModule } from "@/api/tags/tags.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerConfigModule,
    DbModule,
    NatsModule,
    TxModule,
    TagsModule,
    EventsModule,
    AuthGuardModule,
  ],
  controllers: [HealthController, AuthController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
