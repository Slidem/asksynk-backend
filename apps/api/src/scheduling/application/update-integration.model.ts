import { CalendarSyncDirection } from "@/api/scheduling/domain/calendar-integration";

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
