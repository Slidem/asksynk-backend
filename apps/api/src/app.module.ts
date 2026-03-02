import { APP_INTERCEPTOR } from "@nestjs/core";
import { AuthController } from "@/api/auth/auth.controller";
import { AuthGuardModule } from "@/api/auth/authGuard.module";
import { ConfigModule } from "@nestjs/config";
import { DbModule } from "@/api/common/db/db.module";
import { EncodeIdsInterceptor } from "@/api/common/interceptors/encodeIds.interceptor";
import { HealthController } from "@/api/health/health.controller";
import { LoggerConfigModule } from "@/api/common/logger/logger.config";
import { Module } from "@nestjs/common";
import { NatsModule } from "@/api/common/nats/nats.module";
import { TagsModule } from "@/api/tags/tags.module";
import { TxModule } from "@/api/common/db/tx.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerConfigModule,
    DbModule,
    NatsModule,
    TxModule,
    TagsModule,
    AuthGuardModule,
  ],
  controllers: [HealthController, AuthController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: EncodeIdsInterceptor }],
})
export class AppModule {}
