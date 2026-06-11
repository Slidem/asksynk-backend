import { Calendar } from "@/api/calendar-events/entities/calendar.entity";
import { CalendarIntegration } from "@/api/calendar-integrations/entities/calendar-integration.entity";

export interface IntegrationWithCalendars {
  integration: CalendarIntegration;
  calendars: Calendar[];
}
