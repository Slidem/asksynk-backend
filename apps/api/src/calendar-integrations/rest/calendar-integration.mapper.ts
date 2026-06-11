import { IntegrationWithCalendars } from "@/api/calendar-integrations/models/integration-with-calendars.model";
import { CalendarIntegrationResponseDto } from "@/api/calendar-integrations/rest/responses/calendar-integration.response";

export function toCalendarIntegrationResponseDto(
  input: IntegrationWithCalendars,
): CalendarIntegrationResponseDto {
  const { integration, calendars } = input;
  return {
    id: integration.id,
    provider: integration.provider,
    status: integration.status,
    syncDirection: integration.syncDirection,
    accountEmail: integration.providerData.accountEmail,
    lastError: integration.lastError,
    calendars: calendars.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      externalId: c.externalId,
      syncEnabled: c.syncEnabled,
    })),
  };
}
