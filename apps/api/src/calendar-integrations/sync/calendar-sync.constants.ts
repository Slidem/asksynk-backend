// Queue that the poll cron enqueues onto; its worker fans out per-calendar jobs.
export const CALENDAR_SYNC_POLL_QUEUE = "calendar.sync.poll";

// Per-calendar incremental sync queue (one running job per calendar via singletonKey).
export const CALENDAR_SYNC_QUEUE = "calendar.sync";

// How often the poll fan-out runs (cron). Runs every minute. Webhooks would supplement this later.
export const CALENDAR_SYNC_POLL_CRON = "*/1 * * * *";

// Dedup window for per-calendar jobs — roughly one poll interval.
export const CALENDAR_SYNC_SINGLETON_SECONDS = 240;

export interface CalendarSyncJob {
  calendarId: string;
}
