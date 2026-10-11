import { CalendarEvent } from "@/api/scheduling/domain/calendar-event";
import { CalendarEventInstance } from "@/api/scheduling/domain/calendar-event-instance.model";
import { getInstanceId } from "@/api/scheduling/domain/instance-id";

export const toCalendarEventInstance = (
  event: CalendarEvent,
  source: string,
): CalendarEventInstance => {
  return {
    eventId: event.id,
    instanceId: getInstanceId(event.id, event.start),
    calendarId: event.calendarId,
    source,
    readOnly: source !== "asksynk",
    title: event.title,
    description: event.description,
    location: event.location,
    link: event.link,
    instanceStart: event.start,
    durationSeconds: event.durationSeconds,
    allDay: event.allDay,
    timezone: event.timezone,
    color: event.color,
    rrule: event.rrule,
    tagIds: event.tagIds,
  };
};
