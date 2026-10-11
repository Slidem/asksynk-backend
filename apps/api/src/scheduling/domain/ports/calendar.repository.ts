import { Calendar } from "@/api/scheduling/entities/calendar.entity";

export abstract class CalendarRepository {
  abstract ensureAsksynkCalendar(userId: string, id: string): Promise<Calendar>;
  abstract getAsksynkByUserId(userId: string): Promise<Calendar | null>;
  abstract getById(id: string): Promise<Calendar | null>;
  abstract listByUserId(userId: string): Promise<Calendar[]>;
  abstract listByIntegration(integrationId: string): Promise<Calendar[]>;
  abstract getByIntegrationAndExternalId(
    integrationId: string,
    externalId: string,
  ): Promise<Calendar | null>;
  abstract listSyncEnabledProviderCalendars(): Promise<Calendar[]>;
  abstract add(calendar: Calendar): Promise<Calendar>;
  abstract setSyncEnabled(calendarId: string, enabled: boolean): Promise<void>;
  abstract updateSyncToken(
    calendarId: string,
    syncToken: string | null,
  ): Promise<void>;
}
