import { Module } from "@nestjs/common";

import { CalendarRepository } from "@/api/calendar-events/repositories/calendar.repository";
import { CalendarEventsRepository } from "@/api/calendar-events/repositories/calendar-events.repository";
import { CalendarEventsController } from "@/api/calendar-events/rest/calendar-events.controller";
import { CalendarEventsService } from "@/api/calendar-events/services/calendar-events.service";
import { NetworksModule } from "@/api/networks/networks.module";
import { TagRepository } from "@/api/tags/repositories/tags.repository";
import { EventsPublisherModule } from "@/shared/event-publisher/events-publisher.module";

@Module({
  imports: [EventsPublisherModule, NetworksModule],
  providers: [
    CalendarRepository,
    CalendarEventsRepository,
    CalendarEventsService,
    TagRepository,
  ],
  controllers: [CalendarEventsController],
  exports: [CalendarEventsService, CalendarRepository, CalendarEventsRepository],
})
export class CalendarEventsModule {}
