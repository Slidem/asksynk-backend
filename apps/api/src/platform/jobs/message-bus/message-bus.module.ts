import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { MessageBusService } from "./message-bus.service";

@Module({
  imports: [ConfigModule],
  providers: [MessageBusService],
  exports: [MessageBusService],
})
export class MessageBusModule {}
