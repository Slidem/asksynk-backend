export interface ProviderCalendarResponseDto {
  id: string;
  name: string | null;
  color: string | null;
  externalId: string | null;
  syncEnabled: boolean;
}

export interface CalendarIntegrationResponseDto {
  id: string;
  provider: string;
  status: string;
  syncDirection: string;
  accountEmail: string | null;
  lastError: string | null;
  calendars: ProviderCalendarResponseDto[];
}

export interface AuthUrlResponseDto {
  url: string;
}
