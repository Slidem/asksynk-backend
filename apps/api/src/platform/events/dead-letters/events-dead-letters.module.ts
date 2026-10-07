import { Module } from "@nestjs/common";

import { EventsDeadLettersRepository } from "@/api/platform/events/dead-letters/events-dead-letters.repository";
import { EventsDeadLettersService } from "@/api/platform/events/dead-letters/events-dead-letters.service";
import { EventHandlersModule } from "@/api/platform/events/decorators/event-handlers.module";
import { MessageBusModule } from "@/api/platform/jobs/message-bus/message-bus.module";

@Module({
  imports: [EventHandlersModule, MessageBusModule],
  providers: [EventsDeadLettersRepository, EventsDeadLettersService],
  exports: [EventsDeadLettersRepository, EventsDeadLettersService],
})
export class EventsDeadLettersModule {}
