import { Module } from "@nestjs/common";

import { NetworkModule } from "@/api/network/network.module";
import { EventsPublisherModule } from "@/api/platform/events/publisher/events-publisher.module";
import { JobsModule } from "@/api/platform/jobs/jobs.module";
import { CalendarEventsService } from "@/api/scheduling/application/calendar-events.service";
import { CalendarIntegrationService } from "@/api/scheduling/application/calendar-integration.service";
import { CalendarOutboundSyncService } from "@/api/scheduling/application/calendar-outbound-sync.service";
import { CalendarProviderRegistry } from "@/api/scheduling/application/calendar-provider.registry";
import { CalendarSyncService } from "@/api/scheduling/application/calendar-sync.service";
import { CalendarOccurrencePort } from "@/api/scheduling/contract/occurrence.port";
import { CalendarRepository } from "@/api/scheduling/domain/ports/calendar.repository";
import { CalendarEventLinkRepository } from "@/api/scheduling/domain/ports/calendar-event-link.repository";
import { CalendarEventsRepository } from "@/api/scheduling/domain/ports/calendar-events.repository";
import { CalendarIntegrationRepository } from "@/api/scheduling/domain/ports/calendar-integration.repository";
import { GoogleCalendarProvider } from "@/api/scheduling/infrastructure/acl/google-calendar.provider";
import { DrizzleCalendarOccurrenceQuery } from "@/api/scheduling/infrastructure/persistence/calendar-occurrence.query";
import { DrizzleCalendarRepository } from "@/api/scheduling/infrastructure/persistence/drizzle-calendar.repository";
import { DrizzleCalendarEventLinkRepository } from "@/api/scheduling/infrastructure/persistence/drizzle-calendar-event-link.repository";
import { DrizzleCalendarEventsRepository } from "@/api/scheduling/infrastructure/persistence/drizzle-calendar-events.repository";
import { DrizzleCalendarIntegrationRepository } from "@/api/scheduling/infrastructure/persistence/drizzle-calendar-integration.repository";
import { CalendarSyncEventHandler } from "@/api/scheduling/presentation/events/calendar-sync.event-handler";
import { CalendarSyncJobHandlers } from "@/api/scheduling/presentation/jobs/calendar-sync.job-handlers";
import { CalendarEventsController } from "@/api/scheduling/presentation/rest/calendar-events.controller";
import { CalendarIntegrationsController } from "@/api/scheduling/presentation/rest/calendar-integrations.controller";
import { TaggingModule } from "@/api/tagging/tagging.module";

@Module({
  imports: [EventsPublisherModule, JobsModule, NetworkModule, TaggingModule],
  providers: [
    { provide: CalendarRepository, useClass: DrizzleCalendarRepository },
    { provide: CalendarEventsRepository, useClass: DrizzleCalendarEventsRepository },
    { provide: CalendarIntegrationRepository, useClass: DrizzleCalendarIntegrationRepository },
    { provide: CalendarEventLinkRepository, useClass: DrizzleCalendarEventLinkRepository },
    { provide: CalendarOccurrencePort, useClass: DrizzleCalendarOccurrenceQuery },
    GoogleCalendarProvider,
    {
      provide: CalendarProviderRegistry,
      useFactory: (google: GoogleCalendarProvider) =>
        new CalendarProviderRegistry([google]),
      inject: [GoogleCalendarProvider],
    },
    CalendarEventsService,
    CalendarIntegrationService,
    CalendarSyncService,
    CalendarOutboundSyncService,
    CalendarSyncJobHandlers,
    CalendarSyncEventHandler,
  ],
  controllers: [CalendarEventsController, CalendarIntegrationsController],
  exports: [CalendarOccurrencePort],
})
export class SchedulingModule {}
