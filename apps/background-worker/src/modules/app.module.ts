import { ConfigModule } from "@nestjs/config";
import { LoggerConfigModule } from "@/shared/logger/logger.config";
import { Module } from "@nestjs/common";
import { NatsSubscriberService } from "@/worker/services/nats-subscriber.service";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), LoggerConfigModule],
  providers: [NatsSubscriberService],
})
export class AppModule {}
