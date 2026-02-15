import { ConfigModule } from "@nestjs/config";
import { EmailModule } from "@/shared/email/email.module";
import { LoggerConfigModule } from "@/shared/logger.config";
import { Module } from "@nestjs/common";
import { NatsSubscriberService } from "@/worker/services/subscriber.service";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerConfigModule,
    EmailModule,
  ],
  providers: [NatsSubscriberService],
})
export class AppModule {}
