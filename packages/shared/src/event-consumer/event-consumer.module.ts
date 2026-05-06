import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DiscoveryModule } from "@nestjs/core";

import { MessageBusModule } from "../message-bus/message-bus.module";
import { DurableConsumerRuntime } from "./durable-consumer-runtime.service";
import { EventConsumerDiscovery } from "./event-consumer.discovery";
import { RealtimeListenerService } from "./realtime-listener.service";

@Module({
  imports: [DiscoveryModule, ConfigModule, MessageBusModule],
  providers: [
    RealtimeListenerService,
    DurableConsumerRuntime,
    EventConsumerDiscovery,
  ],
  exports: [],
})
export class EventConsumerModule {}
