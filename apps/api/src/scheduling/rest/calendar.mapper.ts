import { Calendar } from "@/api/scheduling/entities/calendar.entity";
import { CalendarResponseDto } from "@/api/scheduling/rest/responses/calendar.response";

export function toCalendarResponseDto(calendar: Calendar): CalendarResponseDto {
  return {
    id: calendar.id,
    userId: calendar.userId,
    source: calendar.source,
    color: calendar.color,
  };
}
