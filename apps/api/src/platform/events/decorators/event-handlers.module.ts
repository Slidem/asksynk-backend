import { Module } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";

import { EventHandlersRegistry } from "@/api/platform/events/decorators/event-handlers.registry";
import { MessageBusModule } from "@/api/platform/jobs/message-bus/message-bus.module";

@Module({
  imports: [DiscoveryModule, MessageBusModule],
  providers: [EventHandlersRegistry],
  exports: [EventHandlersRegistry],
})
export class EventHandlersModule {}
