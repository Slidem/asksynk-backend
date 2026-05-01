import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { EmailModule } from "@/shared/email/email.module";
import { LoggerConfigModule } from "@/shared/logger.config";
import { MessageBusModule } from "@/shared/message-bus/message-bus.module";
import { TagEventsSubscriber } from "@/worker/services/tag-events.subscriber";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerConfigModule,
    EmailModule,
    MessageBusModule,
  ],
  providers: [TagEventsSubscriber],
})
export class AppModule {}
