import { Module } from "@nestjs/common";

import { JobsModule } from "@/api/platform/jobs/jobs.module";
import { CalendarEventLinkRepository } from "@/api/scheduling/domain/ports/calendar-event-link.repository";
import { CalendarIntegrationRepository } from "@/api/scheduling/domain/ports/calendar-integration.repository";
import { CalendarProviderRegistry } from "@/api/scheduling/providers/calendar-provider.registry";
import { GoogleCalendarProvider } from "@/api/scheduling/providers/google-calendar.provider";
import { DrizzleCalendarEventLinkRepository } from "@/api/scheduling/repositories/drizzle-calendar-event-link.repository";
import { DrizzleCalendarIntegrationRepository } from "@/api/scheduling/repositories/drizzle-calendar-integration.repository";
import { CalendarIntegrationsController } from "@/api/scheduling/rest/calendar-integrations.controller";
import { SchedulingModule } from "@/api/scheduling/scheduling.module";
import { CalendarIntegrationService } from "@/api/scheduling/services/calendar-integration.service";
import { CalendarOutboundSyncService } from "@/api/scheduling/services/calendar-outbound-sync.service";
import { CalendarSyncService } from "@/api/scheduling/services/calendar-sync.service";
import { CalendarSyncEventHandler } from "@/api/scheduling/sync/calendar-sync.event-handler";
import { CalendarSyncJobHandlers } from "@/api/scheduling/sync/calendar-sync.job-handlers";

@Module({
  imports: [SchedulingModule, JobsModule],
  providers: [
    GoogleCalendarProvider,
    CalendarProviderRegistry,
    { provide: CalendarIntegrationRepository, useClass: DrizzleCalendarIntegrationRepository },
    { provide: CalendarEventLinkRepository, useClass: DrizzleCalendarEventLinkRepository },
    CalendarIntegrationService,
    CalendarSyncService,
    CalendarOutboundSyncService,
    CalendarSyncJobHandlers,
    CalendarSyncEventHandler,
  ],
  controllers: [CalendarIntegrationsController],
})
export class CalendarIntegrationsModule {}
