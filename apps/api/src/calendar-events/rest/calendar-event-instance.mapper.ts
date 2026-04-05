import { CalendarEventInstance } from "@/api/calendar-events/models/calendar-event-instance.model";
import { CalendarEventInstanceResponseDto } from "@/api/calendar-events/rest/responses/calendar-event-instance.response";
import { utcToIso } from "@/api/calendar-events/utils/recurrence.utils";

export function toCalendarEventInstanceResponseDto(
  instance: CalendarEventInstance,
): CalendarEventInstanceResponseDto {
  const instanceStart = utcToIso(instance.instanceStart, instance.timezone);

  const endMs =
    instance.instanceStart.getTime() + instance.durationSeconds * 1000;

  const instanceEnd = utcToIso(new Date(endMs), instance.timezone);

  return {
    eventId: instance.eventId,
    title: instance.title,
    description: instance.description,
    location: instance.location,
    link: instance.link,
    instanceStart,
    instanceEnd,
    durationSeconds: instance.durationSeconds,
    allDay: instance.allDay,
    timezone: instance.timezone,
    color: instance.color,
    tagIds: instance.tagIds,
  };
}
