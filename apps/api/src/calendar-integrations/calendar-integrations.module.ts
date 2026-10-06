import { Module } from "@nestjs/common";

import { CalendarEventsModule } from "@/api/calendar-events/calendar-events.module";
import { CalendarProviderRegistry } from "@/api/calendar-integrations/providers/calendar-provider.registry";
import { GoogleCalendarProvider } from "@/api/calendar-integrations/providers/google-calendar.provider";
import { CalendarEventLinkRepository } from "@/api/calendar-integrations/repositories/calendar-event-link.repository";
import { CalendarIntegrationRepository } from "@/api/calendar-integrations/repositories/calendar-integration.repository";
import { CalendarIntegrationsController } from "@/api/calendar-integrations/rest/calendar-integrations.controller";
import { CalendarIntegrationService } from "@/api/calendar-integrations/services/calendar-integration.service";
import { CalendarOutboundSyncService } from "@/api/calendar-integrations/services/calendar-outbound-sync.service";
import { CalendarSyncService } from "@/api/calendar-integrations/services/calendar-sync.service";
import { CalendarSyncEventHandler } from "@/api/calendar-integrations/sync/calendar-sync.event-handler";
import { CalendarSyncJobHandlers } from "@/api/calendar-integrations/sync/calendar-sync.job-handlers";
import { JobsModule } from "@/api/platform/jobs/jobs.module";

@Module({
  imports: [CalendarEventsModule, JobsModule],
  providers: [
    GoogleCalendarProvider,
    CalendarProviderRegistry,
    CalendarIntegrationRepository,
    CalendarEventLinkRepository,
    CalendarIntegrationService,
    CalendarSyncService,
    CalendarOutboundSyncService,
    CalendarSyncJobHandlers,
    CalendarSyncEventHandler,
  ],
  controllers: [CalendarIntegrationsController],
})
export class CalendarIntegrationsModule {}
