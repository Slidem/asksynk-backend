import { AuthController } from "@/api/routes/auth.controller";
import { AuthGuardModule } from "../auth/authGuard.module";
import { ConfigModule } from "@nestjs/config";
import { DbModule } from "@/api/modules/db.module";
import { HealthController } from "@/api/routes/health.controller";
import { LoggerConfigModule } from "@/api/logger/logger.config";
import { Module } from "@nestjs/common";
import { NatsModule } from "@/api/modules/nats.module";
import { TagsModule } from "@/api/modules/tag.module";
import { TxModule } from "@/api/modules/tx.module";

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
})
export class AppModule {}
