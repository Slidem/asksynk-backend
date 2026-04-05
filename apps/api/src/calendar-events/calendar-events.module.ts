import { Module } from "@nestjs/common";

import { CalendarRepository } from "@/api/calendar-events/repositories/calendar.repository";
import { CalendarEventsRepository } from "@/api/calendar-events/repositories/calendar-events.repository";
import { CalendarEventsController } from "@/api/calendar-events/rest/calendar-events.controller";
import { CalendarEventsService } from "@/api/calendar-events/services/calendar-events.service";
import { NatsModule } from "@/api/infrastructure/nats/nats.module";
import { TagRepository } from "@/api/tags/repositories/tags.repository";

@Module({
  imports: [NatsModule],
  providers: [
    CalendarRepository,
    CalendarEventsRepository,
    CalendarEventsService,
    TagRepository,
  ],
  controllers: [CalendarEventsController],
  exports: [CalendarEventsService],
})
export class CalendarEventsModule {}
