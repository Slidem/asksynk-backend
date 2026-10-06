import { defineCronJob, defineJob } from "@/api/platform/jobs/define-job";

/** Cron that fans out one sync job per sync-enabled calendar. Runs every minute; webhooks would supplement this later. */
export const CalendarSyncPollJob = defineCronJob({
  name: "calendar.sync.poll",
  cron: "*/1 * * * *",
});

export type CalendarSyncPayload = { calendarId: string };

/** Per-calendar incremental sync. */
export const CalendarSyncJob = defineJob<CalendarSyncPayload>({
  name: "calendar.sync",
  options: {
    retryLimit: 3,
    retryDelaySeconds: 30,
    retryBackoff: true,
    concurrency: 4,
  },
});

/** Dedup bucket. Must stay ≤ CalendarSyncJob's deleteAfterSeconds (default 1h). */
const CALENDAR_SYNC_SLOT_SECONDS = 240;

export const calendarSyncJobId = (calendarId: string, now: Date) =>
  `${calendarId}:${Math.floor(now.getTime() / 1000 / CALENDAR_SYNC_SLOT_SECONDS)}`;
