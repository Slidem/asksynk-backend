import {
  CalendarIntegration,
  CalendarIntegrationStatus,
} from "@/api/scheduling/entities/calendar-integration.entity";
import { CalendarIntegrationCredentials } from "@/migrations/schema/calendarIntegrations";

export abstract class CalendarIntegrationRepository {
  abstract add(integration: CalendarIntegration): Promise<CalendarIntegration>;
  abstract getById(id: string): Promise<CalendarIntegration | null>;
  abstract getByIdForUpdate(id: string): Promise<CalendarIntegration | null>;
  abstract getOwned(
    id: string,
    userId: string,
  ): Promise<CalendarIntegration | null>;
  abstract listByUser(userId: string): Promise<CalendarIntegration[]>;
  abstract updateCredentials(
    id: string,
    credentials: CalendarIntegrationCredentials,
  ): Promise<void>;
  abstract updateStatus(
    id: string,
    status: CalendarIntegrationStatus,
    lastError: string | null,
  ): Promise<void>;
  abstract updateSyncDirection(
    id: string,
    syncDirection: CalendarIntegration["syncDirection"],
  ): Promise<void>;
  abstract delete(id: string): Promise<void>;
}
