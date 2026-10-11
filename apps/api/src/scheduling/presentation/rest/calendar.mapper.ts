import { Calendar } from "@/api/scheduling/domain/calendar";
import { CalendarResponseDto } from "@/api/scheduling/presentation/rest/responses/calendar.response";

export function toCalendarResponseDto(calendar: Calendar): CalendarResponseDto {
  return {
    id: calendar.id,
    userId: calendar.userId,
    source: calendar.source,
    color: calendar.color,
  };
}
