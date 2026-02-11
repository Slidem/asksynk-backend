import { ConfigModule } from "@nestjs/config";
import { DbModule } from "@/api/modules/db.module";
import { DummyController } from "@/api/routes/dummy.controller";
import { HealthController } from "@/api/routes/health.controller";
import { LoggerConfigModule } from "../logger/logger.config";
import { Module } from "@nestjs/common";
import { NatsModule } from "@/api/modules/nats.module";
import { TagsModule } from "@/api/modules/tag.module";
import { TxModule } from "./tx.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerConfigModule,
    DbModule,
    NatsModule,
    TxModule,
    TagsModule,
  ],
  providers: [],
  controllers: [HealthController, DummyController],
})
export class AppModule {}
