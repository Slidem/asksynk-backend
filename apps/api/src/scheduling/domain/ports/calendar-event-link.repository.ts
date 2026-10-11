import { CalendarEventLink } from "@/api/scheduling/domain/calendar-event-link";

export abstract class CalendarEventLinkRepository {
  abstract add(link: CalendarEventLink): Promise<CalendarEventLink>;
  abstract getByExternal(
    integrationId: string,
    externalEventId: string,
  ): Promise<CalendarEventLink | null>;
  abstract getByEventAndIntegration(
    asksynkEventId: string,
    integrationId: string,
  ): Promise<CalendarEventLink | null>;
  abstract listByEvent(asksynkEventId: string): Promise<CalendarEventLink[]>;
  abstract updateEtag(id: string, etag: string | null): Promise<void>;
  abstract delete(id: string): Promise<void>;
  abstract deleteImportedByCalendar(
    integrationId: string,
    externalCalendarId: string,
  ): Promise<void>;
}
