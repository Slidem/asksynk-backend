import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { calendar_v3, google } from "googleapis";
import { ContextLogger } from "nestjs-context-logger";

import { CalendarProvider } from "@/api/calendar-integrations/providers/calendar-provider";
import {
  ExternalCalendar,
  ExternalEvent,
  ExternalEventInput,
  ExternalEventTime,
  ListEventsResult,
  OAuthExchange,
  ProviderCredentials,
  WriteEventResult,
} from "@/api/calendar-integrations/providers/types";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

@Injectable()
export class GoogleCalendarProvider extends CalendarProvider {
  readonly provider = "google";

  private readonly logger = new ContextLogger(GoogleCalendarProvider.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(private readonly config: ConfigService) {
    super();
    this.clientId = config.getOrThrow<string>("GOOGLE_CLIENT_ID");
    this.clientSecret = config.getOrThrow<string>("GOOGLE_CLIENT_SECRET");
    this.redirectUri = config.getOrThrow<string>("GOOGLE_REDIRECT_URI");
  }

  getAuthUrl(state: string): string {
    return this.oauthClient().generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: GOOGLE_SCOPES,
      state,
    });
  }

  async exchangeCode(code: string): Promise<OAuthExchange> {
    const client = this.oauthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const { data } = await google
      .oauth2({ version: "v2", auth: client })
      .userinfo.get();

    return {
      credentials: this.toCredentials(tokens),
      externalAccountId: data.id ?? data.email ?? "",
      accountEmail: data.email ?? null,
    };
  }

  async refreshCredentials(
    creds: ProviderCredentials,
  ): Promise<ProviderCredentials> {
    if (!creds.refreshToken) {
      throw new Error("Cannot refresh credentials without a refresh token");
    }
    const client = this.oauthClient();
    client.setCredentials({ refresh_token: creds.refreshToken });
    const { credentials } = await client.refreshAccessToken();
    // Google keeps the refresh token stable; preserve ours if the refresh omits it.
    return {
      ...this.toCredentials(credentials),
      refreshToken: credentials.refresh_token ?? creds.refreshToken,
    };
  }

  async listCalendars(creds: ProviderCredentials): Promise<ExternalCalendar[]> {
    const api = this.calendarApi(creds);
    const out: ExternalCalendar[] = [];
    let pageToken: string | undefined;
    do {
      const { data } = await api.calendarList.list({
        pageToken,
        maxResults: 250,
      });
      for (const item of data.items ?? []) {
        if (!item.id) continue;
        out.push({
          externalId: item.id,
          name: item.summaryOverride ?? item.summary ?? item.id,
          primary: item.primary ?? false,
          color: item.backgroundColor ?? null,
          timezone: item.timeZone ?? null,
        });
      }
      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken);
    return out;
  }

  async listEvents(
    creds: ProviderCredentials,
    externalCalendarId: string,
    syncToken: string | null,
  ): Promise<ListEventsResult> {
    const api = this.calendarApi(creds);
    const events: ExternalEvent[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | null = null;

    try {
      do {
        const { data } = await api.events.list({
          calendarId: externalCalendarId,
          // incremental sync requires the same params across calls; keep them minimal
          syncToken: syncToken ?? undefined,
          singleEvents: false,
          showDeleted: true,
          maxResults: 250,
          pageToken,
        });
        for (const item of data.items ?? []) {
          const mapped = this.mapEvent(item);
          if (mapped) events.push(mapped);
        }
        pageToken = data.nextPageToken ?? undefined;
        nextSyncToken = data.nextSyncToken ?? nextSyncToken;
      } while (pageToken);
    } catch (err) {
      if (this.isSyncTokenExpired(err)) {
        this.logger.warn("Google sync token expired, full re-list required", {
          externalCalendarId,
        });
        return { events: [], nextSyncToken: null, tokenExpired: true };
      }
      throw err;
    }

    return { events, nextSyncToken, tokenExpired: false };
  }

  async createEvent(
    creds: ProviderCredentials,
    externalCalendarId: string,
    event: ExternalEventInput,
  ): Promise<WriteEventResult> {
    const api = this.calendarApi(creds);
    const { data } = await api.events.insert({
      calendarId: externalCalendarId,
      requestBody: this.toGoogleEvent(event),
    });
    return { externalEventId: data.id!, etag: data.etag ?? null };
  }

  async updateEvent(
    creds: ProviderCredentials,
    externalCalendarId: string,
    externalEventId: string,
    event: ExternalEventInput,
  ): Promise<WriteEventResult> {
    const api = this.calendarApi(creds);
    const { data } = await api.events.patch({
      calendarId: externalCalendarId,
      eventId: externalEventId,
      requestBody: this.toGoogleEvent(event),
    });
    return { externalEventId: data.id!, etag: data.etag ?? null };
  }

  async deleteEvent(
    creds: ProviderCredentials,
    externalCalendarId: string,
    externalEventId: string,
  ): Promise<void> {
    const api = this.calendarApi(creds);
    try {
      await api.events.delete({
        calendarId: externalCalendarId,
        eventId: externalEventId,
      });
    } catch (err) {
      // already gone on the provider side — treat as success
      if (this.statusOf(err) === 404 || this.statusOf(err) === 410) return;
      throw err;
    }
  }

  async revoke(creds: ProviderCredentials): Promise<void> {
    const token = creds.refreshToken ?? creds.accessToken;
    if (!token) return;
    try {
      await this.oauthClient().revokeToken(token);
    } catch (err) {
      this.logger.warn("Google token revoke failed (ignored)", { err });
    }
  }

  private oauthClient(
    creds?: ProviderCredentials,
  ): InstanceType<typeof google.auth.OAuth2> {
    const client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri,
    );
    if (creds) {
      client.setCredentials({
        access_token: creds.accessToken ?? undefined,
        refresh_token: creds.refreshToken ?? undefined,
        expiry_date: creds.expiresAt ?? undefined,
        scope: creds.scope ?? undefined,
        token_type: creds.tokenType ?? undefined,
      });
    }
    return client;
  }

  private calendarApi(creds: ProviderCredentials): calendar_v3.Calendar {
    return google.calendar({ version: "v3", auth: this.oauthClient(creds) });
  }

  private toCredentials(tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
    scope?: string | null;
    token_type?: string | null;
  }): ProviderCredentials {
    return {
      accessToken: tokens.access_token ?? null,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: tokens.expiry_date ?? null,
      scope: tokens.scope ?? null,
      tokenType: tokens.token_type ?? null,
    };
  }

  private mapEvent(item: calendar_v3.Schema$Event): ExternalEvent | null {
    if (!item.id) return null;
    const cancelled = item.status === "cancelled";
    return {
      externalEventId: item.id,
      etag: item.etag ?? null,
      cancelled,
      title: item.summary ?? "(untitled)",
      description: item.description ?? null,
      location: item.location ?? null,
      link: item.hangoutLink ?? item.htmlLink ?? null,
      start: this.mapTime(item.start),
      end: this.mapTime(item.end),
      allDay: !!item.start?.date,
      recurrence: item.recurrence ?? null,
      recurringEventExternalId: item.recurringEventId ?? null,
      originalStart: this.mapTime(item.originalStartTime),
    };
  }

  private mapTime(
    time: calendar_v3.Schema$EventDateTime | undefined,
  ): ExternalEventTime | null {
    if (!time) return null;
    const value = time.dateTime ?? time.date;
    if (!value) return null;
    return { value, timezone: time.timeZone ?? null };
  }

  private toGoogleEvent(event: ExternalEventInput): calendar_v3.Schema$Event {
    const body: calendar_v3.Schema$Event = {
      summary: event.title,
      description: event.description ?? undefined,
      location: event.location ?? undefined,
    };
    if (event.allDay) {
      body.start = { date: event.start.slice(0, 10) };
      body.end = { date: event.end.slice(0, 10) };
    } else {
      body.start = { dateTime: event.start, timeZone: event.timezone };
      body.end = { dateTime: event.end, timeZone: event.timezone };
    }
    if (event.rrule) {
      // Google expects an "RRULE:" line without a TZID param (tz lives on start).
      const rule = event.rrule.replace(/;?TZID=[^;]+/i, "");
      body.recurrence = [`RRULE:${rule}`];
    }
    return body;
  }

  private isSyncTokenExpired(err: unknown): boolean {
    return this.statusOf(err) === 410;
  }

  private statusOf(err: unknown): number | undefined {
    const e = err as { code?: number; response?: { status?: number } };
    return e?.response?.status ?? e?.code;
  }
}
