import { Module } from "@nestjs/common";

import { CalendarRepository } from "@/api/events/repositories/calendar.repository";
import { EventsRepository } from "@/api/events/repositories/events.repository";
import { EventsController } from "@/api/events/rest/events.controller";
import { EventsService } from "@/api/events/services/events.service";
import { NatsModule } from "@/api/infrastructure/nats/nats.module";
import { TagRepository } from "@/api/tags/repositories/tags.repository";

@Module({
  imports: [NatsModule],
  providers: [
    CalendarRepository,
    EventsRepository,
    EventsService,
    TagRepository,
  ],
  controllers: [EventsController],
  exports: [EventsService],
})
export class EventsModule {}
