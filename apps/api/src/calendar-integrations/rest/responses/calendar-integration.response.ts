import { ApiProperty } from "@nestjs/swagger";

import {
  CALENDAR_INTEGRATION_STATUSES,
  CALENDAR_SYNC_DIRECTIONS,
  CalendarIntegrationStatus,
  CalendarSyncDirection,
} from "@/api/calendar-integrations/entities/calendar-integration.entity";

export class ProviderCalendarResponseDto {
  id!: string;
  name!: string | null;
  color!: string | null;
  externalId!: string | null;
  syncEnabled!: boolean;
}

export class CalendarIntegrationResponseDto {
  id!: string;
  provider!: string;

  @ApiProperty({
    enum: [...CALENDAR_INTEGRATION_STATUSES],
    enumName: "CalendarIntegrationStatus",
  })
  status!: CalendarIntegrationStatus;

  @ApiProperty({
    enum: [...CALENDAR_SYNC_DIRECTIONS],
    enumName: "CalendarSyncDirection",
  })
  syncDirection!: CalendarSyncDirection;

  accountEmail!: string | null;
  lastError!: string | null;
  calendars!: ProviderCalendarResponseDto[];
}

export class AuthUrlResponseDto {
  url!: string;
}
