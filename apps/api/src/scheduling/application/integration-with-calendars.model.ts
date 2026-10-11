import { Calendar } from "@/api/scheduling/domain/calendar";
import { CalendarIntegration } from "@/api/scheduling/domain/calendar-integration";

export interface IntegrationWithCalendars {
  integration: CalendarIntegration;
  calendars: Calendar[];
}
