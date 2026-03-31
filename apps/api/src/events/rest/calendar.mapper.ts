import { Calendar } from "@/api/events/entities/calendar.entity";
import { CalendarResponseDto } from "@/api/events/rest/responses/calendar.response";

export function toCalendarResponseDto(calendar: Calendar): CalendarResponseDto {
  return {
    id: calendar.id,
    userId: calendar.userId,
    source: calendar.source,
    color: calendar.color,
  };
}
