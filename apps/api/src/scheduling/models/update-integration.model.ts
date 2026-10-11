import { CalendarSyncDirection } from "@/api/scheduling/entities/calendar-integration.entity";

export interface CalendarSyncSelection {
  calendarId: string;
  syncEnabled: boolean;
}

export interface UpdateIntegrationInput {
  userId: string;
  integrationId: string;
  syncDirection?: CalendarSyncDirection;
  calendars?: CalendarSyncSelection[];
}
