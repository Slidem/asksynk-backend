import { CalendarEvent } from "@/api/calendar-events/entities/calendar-event.entity";
import { CalendarEventResponseDto } from "@/api/calendar-events/rest/responses/calendar-event.response";
import { utcToIso } from "@/api/calendar-events/utils/recurrence.utils";

export function toCalendarEventResponseDto(event: CalendarEvent): CalendarEventResponseDto {
  const start = utcToIso(event.start, event.timezone);
  const endMs = event.start.getTime() + event.durationSeconds * 1000;
  const end = utcToIso(new Date(endMs), event.timezone);

  return {
    id: event.id,
    calendarId: event.calendarId,
    title: event.title,
    description: event.description,
    location: event.location,
    link: event.link,
    start,
    end,
    durationSeconds: event.durationSeconds,
    allDay: event.allDay,
    timezone: event.timezone,
    rrule: event.rrule,
    color: event.color,
    isRecurring: event.isRecurring,
    tagIds: event.tagIds,
  };
}
