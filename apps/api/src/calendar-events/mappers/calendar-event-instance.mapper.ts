import { CalendarEvent } from "../entities/calendar-event.entity";
import { CalendarEventInstance } from "../models/calendar-event-instance.model";
import { getInstanceId } from "../utils/instanceId.utils";

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
