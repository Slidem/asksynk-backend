import { Event } from "@/api/events/entities/event.entity";
import { EventResponseDto } from "@/api/events/rest/responses/event.response";
import { utcToIso } from "@/api/events/utils/recurrence.utils";

export function toEventResponseDto(event: Event): EventResponseDto {
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
