import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { MessageBusService } from "@/api/platform/jobs/message-bus/message-bus.service";

@Module({
  imports: [ConfigModule],
  providers: [MessageBusService],
  exports: [MessageBusService],
})
export class MessageBusModule {}
