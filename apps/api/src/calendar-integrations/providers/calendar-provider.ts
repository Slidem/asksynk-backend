import {
  ExternalCalendar,
  ExternalEventInput,
  ListEventsResult,
  OAuthExchange,
  ProviderCredentials,
  WriteEventResult,
} from "@/api/calendar-integrations/providers/types";

/**
 * Provider-agnostic external calendar gateway. Each concrete provider (Google,
 * Outlook, …) implements this; the abstract class doubles as interface and is
 * resolved by name through {@link CalendarProviderRegistry}. Mirrors the
 * `ObjectStorage` pattern: no DB access — credential persistence lives in the
 * service layer.
 */
export abstract class CalendarProvider {
  /** Discriminator stored on `calendar_integrations.provider`. */
  abstract readonly provider: string;

  /** Build the provider consent URL; `state` is an opaque signed token. */
  abstract getAuthUrl(state: string): string;

  /** Exchange an OAuth authorization code for credentials + account identity. */
  abstract exchangeCode(code: string): Promise<OAuthExchange>;

  /** Refresh an expired access token. Returns rotated credentials to persist. */
  abstract refreshCredentials(
    creds: ProviderCredentials,
  ): Promise<ProviderCredentials>;

  /** List the calendars available on the connected account. */
  abstract listCalendars(creds: ProviderCredentials): Promise<ExternalCalendar[]>;

  /**
   * Incremental (or, without `syncToken`, full) event list for one calendar.
   * Sets `tokenExpired` when the provider rejected the sync token.
   */
  abstract listEvents(
    creds: ProviderCredentials,
    externalCalendarId: string,
    syncToken: string | null,
  ): Promise<ListEventsResult>;

  abstract createEvent(
    creds: ProviderCredentials,
    externalCalendarId: string,
    event: ExternalEventInput,
  ): Promise<WriteEventResult>;

  abstract updateEvent(
    creds: ProviderCredentials,
    externalCalendarId: string,
    externalEventId: string,
    event: ExternalEventInput,
  ): Promise<WriteEventResult>;

  abstract deleteEvent(
    creds: ProviderCredentials,
    externalCalendarId: string,
    externalEventId: string,
  ): Promise<void>;

  /** Best-effort revoke of the granted access (on disconnect). */
  abstract revoke(creds: ProviderCredentials): Promise<void>;
}
