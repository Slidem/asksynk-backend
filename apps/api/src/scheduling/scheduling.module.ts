import { Module } from "@nestjs/common";

import { NetworksModule } from "@/api/networks/networks.module";
import { EventsPublisherModule } from "@/api/platform/events/publisher/events-publisher.module";
import { CalendarOccurrencePort } from "@/api/scheduling/contract/occurrence.port";
import { CalendarRepository } from "@/api/scheduling/domain/ports/calendar.repository";
import { CalendarEventsRepository } from "@/api/scheduling/domain/ports/calendar-events.repository";
import { DrizzleCalendarOccurrenceQuery } from "@/api/scheduling/repositories/calendar-occurrence.query";
import { DrizzleCalendarRepository } from "@/api/scheduling/repositories/drizzle-calendar.repository";
import { DrizzleCalendarEventsRepository } from "@/api/scheduling/repositories/drizzle-calendar-events.repository";
import { CalendarEventsController } from "@/api/scheduling/rest/calendar-events.controller";
import { CalendarEventsService } from "@/api/scheduling/services/calendar-events.service";
import { TaggingModule } from "@/api/tagging/tagging.module";

@Module({
  imports: [EventsPublisherModule, NetworksModule, TaggingModule],
  providers: [
    { provide: CalendarRepository, useClass: DrizzleCalendarRepository },
    { provide: CalendarEventsRepository, useClass: DrizzleCalendarEventsRepository },
    CalendarEventsService,
    { provide: CalendarOccurrencePort, useClass: DrizzleCalendarOccurrenceQuery },
  ],
  controllers: [CalendarEventsController],
  exports: [
    CalendarOccurrencePort,
    // Same context: only CalendarIntegrationsModule uses these (merged in 3.2).
    CalendarRepository,
    CalendarEventsRepository,
  ],
})
export class SchedulingModule {}
