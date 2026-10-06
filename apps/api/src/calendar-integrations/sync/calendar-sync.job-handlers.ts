import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";
import { ContextLogger } from "nestjs-context-logger";

import { CalendarRepository } from "@/api/calendar-events/repositories/calendar.repository";
import { CalendarSyncService } from "@/api/calendar-integrations/services/calendar-sync.service";
import {
  CalendarSyncJob,
  calendarSyncJobId,
  CalendarSyncPayload,
} from "@/api/calendar-integrations/sync/calendar-sync.jobs";
import { Clock } from "@/api/platform/clock/clock";
import { CronJob } from "@/api/platform/jobs/cron-job.decorator";
import { JobHandler } from "@/api/platform/jobs/job-handler.decorator";
import { JobScheduler } from "@/api/platform/jobs/job-scheduler";

/**
 * Drives inbound calendar polling across a multi-instance API:
 *  - a pg-boss cron fires on exactly one instance and runs the poll handler;
 *  - the poll enqueues one sync job per sync-enabled calendar, with an id
 *    bucketed per 4-min slot, so repeated triggers in a slot collapse into one;
 *  - sync workers (any instance) process them with retry + failover.
 */
@Injectable()
export class CalendarSyncJobHandlers {
  private readonly logger = new ContextLogger(CalendarSyncJobHandlers.name);

  constructor(
    private readonly jobs: JobScheduler,
    private readonly calendarRepository: CalendarRepository,
    private readonly syncService: CalendarSyncService,
    private readonly clock: Clock,
  ) {}

  /** Fans out one sync job per sync-enabled calendar. Runs every minute; webhooks would supplement this later. */
  @CronJob({ name: "calendar.sync.poll", cron: "*/1 * * * *" })
  async poll(): Promise<void> {
    const now = this.clock.now();
    const calendarIds = await this.listDueCalendarIds();
    this.logger.debug("Calendar sync fan-out", { count: calendarIds.length });

    for (const calendarId of calendarIds) {
      await this.jobs.schedule(
        CalendarSyncJob,
        { calendarId },
        { id: calendarSyncJobId(calendarId, now) },
      );
    }
  }

  @JobHandler(CalendarSyncJob)
  async sync(payload: CalendarSyncPayload): Promise<void> {
    await this.syncService.syncCalendar(payload.calendarId);
  }

  @Transactional()
  private async listDueCalendarIds(): Promise<string[]> {
    const calendars =
      await this.calendarRepository.listSyncEnabledProviderCalendars();
    return calendars.map((c) => c.id);
  }
}
