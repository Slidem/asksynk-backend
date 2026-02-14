import { ConfigModule } from "@nestjs/config";
import { LoggerConfigModule } from "@/shared/logger.config";
import { Module } from "@nestjs/common";
import { NatsSubscriberService } from "@/worker/services/subscriber.service";
import { EmailModule } from "@/worker/email/email.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerConfigModule,
    EmailModule,
  ],
  providers: [NatsSubscriberService],
})
export class AppModule {}
