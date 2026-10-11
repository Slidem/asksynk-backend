import { CalendarEvent } from "@/api/scheduling/entities/calendar-event.entity";
import { CalendarEventInstance } from "@/api/scheduling/models/calendar-event-instance.model";

export abstract class CalendarEventsRepository {
  abstract add(event: CalendarEvent): Promise<CalendarEvent>;
  abstract getById(id: string): Promise<CalendarEvent | null>;
  abstract update(event: CalendarEvent): Promise<CalendarEvent>;
  abstract delete(eventId: string): Promise<void>;
  abstract deleteByCalendar(calendarId: string): Promise<void>;
  abstract listInWindow(
    calendarIds: string[],
    windowStart: Date,
    windowEnd: Date,
    tagIds?: string[],
  ): Promise<CalendarEventInstance[]>;
  abstract addException(eventId: string, occurrenceStart: Date): Promise<void>;
  abstract detachInstance(
    eventId: string,
    occurrenceStart: Date,
    newEvent: CalendarEvent,
  ): Promise<CalendarEvent>;
  abstract splitSeries(
    eventId: string,
    newUntilRrule: string,
    newEvent: CalendarEvent,
  ): Promise<CalendarEvent>;
}
