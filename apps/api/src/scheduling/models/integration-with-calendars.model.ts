import { Calendar } from "@/api/scheduling/entities/calendar.entity";
import { CalendarIntegration } from "@/api/scheduling/entities/calendar-integration.entity";

export interface IntegrationWithCalendars {
  integration: CalendarIntegration;
  calendars: Calendar[];
}
