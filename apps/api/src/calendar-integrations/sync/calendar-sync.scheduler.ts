import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";
import { ContextLogger } from "nestjs-context-logger";

import { CalendarRepository } from "@/api/calendar-events/repositories/calendar.repository";
import { CalendarSyncService } from "@/api/calendar-integrations/services/calendar-sync.service";
import {
  CALENDAR_SYNC_POLL_CRON,
  CALENDAR_SYNC_POLL_QUEUE,
  CALENDAR_SYNC_QUEUE,
  CALENDAR_SYNC_SINGLETON_SECONDS,
  CalendarSyncJob,
} from "@/api/calendar-integrations/sync/calendar-sync.constants";
import { MessageBusService } from "@/shared/message-bus/message-bus.service";

/**
 * Drives inbound calendar polling across a multi-instance API:
 *  - a pg-boss cron fires on exactly one instance and enqueues a fan-out job;
 *  - the fan-out enqueues one sync job per sync-enabled calendar
 *    (`singletonKey = calendarId` collapses concurrent triggers);
 *  - sync workers (any instance) process them with retry + failover.
 */
@Injectable()
export class CalendarSyncScheduler implements OnApplicationBootstrap {
  private readonly logger = new ContextLogger(CalendarSyncScheduler.name);

  constructor(
    private readonly messageBus: MessageBusService,
    private readonly calendarRepository: CalendarRepository,
    private readonly syncService: CalendarSyncService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.messageBus.work(CALENDAR_SYNC_POLL_QUEUE, async () => {
      await this.fanOut();
    });

    await this.messageBus.work<CalendarSyncJob>(
      CALENDAR_SYNC_QUEUE,
      async (data) => {
        await this.syncService.syncCalendar(data.calendarId);
      },
      { localConcurrency: 4 },
    );

    await this.messageBus.scheduleCron(
      CALENDAR_SYNC_POLL_QUEUE,
      CALENDAR_SYNC_POLL_CRON,
    );

    this.logger.info("Calendar sync scheduler started");
  }

  private async fanOut(): Promise<void> {
    const calendarIds = await this.listDueCalendarIds();
    this.logger.debug("Calendar sync fan-out", { count: calendarIds.length });

    for (const calendarId of calendarIds) {
      await this.messageBus.enqueue<CalendarSyncJob>(
        CALENDAR_SYNC_QUEUE,
        { calendarId },
        {
          singletonKey: calendarId,
          singletonSeconds: CALENDAR_SYNC_SINGLETON_SECONDS,
          retryLimit: 3,
          retryDelay: 30,
          retryBackoff: true,
        },
      );
    }
  }

  @Transactional()
  private async listDueCalendarIds(): Promise<string[]> {
    const calendars =
      await this.calendarRepository.listSyncEnabledProviderCalendars();
    return calendars.map((c) => c.id);
  }
}
