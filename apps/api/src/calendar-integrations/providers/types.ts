import { CalendarIntegrationCredentials } from "@/migrations/schema/calendarIntegrations";

export type ProviderCredentials = CalendarIntegrationCredentials;

/** Result of completing an OAuth code exchange. */
export interface OAuthExchange {
  credentials: ProviderCredentials;
  externalAccountId: string;
  accountEmail: string | null;
}

/** A calendar as exposed by the external provider. */
export interface ExternalCalendar {
  externalId: string;
  name: string;
  primary: boolean;
  color: string | null;
  timezone: string | null;
}

/** A point in time as the provider reports it (wall-clock + tz, or a date for all-day). */
export interface ExternalEventTime {
  // RFC3339 dateTime for timed events, or "YYYY-MM-DD" for all-day events
  value: string;
  timezone: string | null;
}

/** An event pulled from the external provider during a sync. */
export interface ExternalEvent {
  externalEventId: string;
  etag: string | null;
  cancelled: boolean;
  title: string;
  description: string | null;
  location: string | null;
  link: string | null;
  start: ExternalEventTime | null;
  end: ExternalEventTime | null;
  allDay: boolean;
  // RRULE/EXDATE/RDATE lines on a recurring master (null otherwise)
  recurrence: string[] | null;
  // set on a recurring-instance override: the master's external id
  recurringEventExternalId: string | null;
  // set on a recurring-instance override: the occurrence this overrides
  originalStart: ExternalEventTime | null;
}

export interface ListEventsResult {
  events: ExternalEvent[];
  nextSyncToken: string | null;
  // true when the provider rejected the sync token (e.g. Google 410 GONE) and a
  // full re-list is required
  tokenExpired: boolean;
}

/** Payload to create/update an event in the external provider (asksynk → provider). */
export interface ExternalEventInput {
  title: string;
  description: string | null;
  location: string | null;
  // wall-clock ISO 8601; timezone is the source of truth
  start: string;
  end: string;
  timezone: string;
  allDay: boolean;
  rrule: string | null;
}

export interface WriteEventResult {
  externalEventId: string;
  etag: string | null;
}
