import { Event } from "@/api/events/event.entity";
import { EventResponseDto } from "@/api/events/events.rest-dto";

export function toEventResponseDto(event: Event): EventResponseDto {
  return {
    id: event.id,
    name: event.name,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    recurrence: event.recurrence,
    tags: event.tags,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}
