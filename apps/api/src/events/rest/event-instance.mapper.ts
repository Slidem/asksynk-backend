import { EventInstance } from "@/api/events/models/event-instance.model";
import { EventInstanceResponseDto } from "@/api/events/rest/responses/event-instance.response";
import { utcToIso } from "@/api/events/utils/recurrence.utils";

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
