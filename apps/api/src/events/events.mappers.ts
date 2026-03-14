import {
  CalendarResponseDto,
  EventInstanceResponseDto,
  EventResponseDto,
} from "@/api/events/events.rest-dto";

import { Calendar } from "@/api/events/calendar.entity";
import { Event } from "@/api/events/event.entity";
import { EventInstance } from "@/api/events/events.model";
import { utcToIso } from "@/api/events/recurrence.utils";

export function toCalendarResponseDto(calendar: Calendar): CalendarResponseDto {
  return {
    id: calendar.id,
    userId: calendar.userId,
    source: calendar.source,
    color: calendar.color,
  };
}

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

export function toEventInstanceResponseDto(
  instance: EventInstance,
): EventInstanceResponseDto {
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
