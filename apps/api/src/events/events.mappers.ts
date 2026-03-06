import { Event } from "@/api/events/event.entity";
import {
  EventResponseDto,
  RecurrenceResponseDto,
  RecurrenceWithEventsResponseDto,
} from "@/api/events/events.rest-dto";
import { Recurrence } from "@/api/events/recurrence.entity";

export function toEventResponseDto(event: Event): EventResponseDto {
  return {
    id: event.id,
    name: event.name,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    recurrenceId: event.recurrenceId,
    tags: event.tags,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

export function toRecurrenceResponseDto(
  recurrence: Recurrence,
): RecurrenceResponseDto {
  return {
    id: recurrence.id,
    type: recurrence.type,
    until: recurrence.until.toISOString(),
    createdAt: recurrence.createdAt.toISOString(),
  };
}

export function toRecurrenceWithEventsResponseDto(
  recurrence: Recurrence,
  events: Event[],
): RecurrenceWithEventsResponseDto {
  return {
    recurrence: toRecurrenceResponseDto(recurrence),
    events: events.map(toEventResponseDto),
  };
}
