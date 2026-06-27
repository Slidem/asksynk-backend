import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  ValidateNested,
} from "class-validator";

import {
  CALENDAR_SYNC_DIRECTIONS,
  CalendarSyncDirection,
} from "@/api/calendar-integrations/entities/calendar-integration.entity";
import { IsUuidV7 } from "@/api/common/decorators/validators";

export class CalendarSyncSelectionDto {
  @IsUuidV7()
  calendarId!: string;

  @IsBoolean()
  syncEnabled!: boolean;
}

export class UpdateIntegrationRequestDto {
  @ApiPropertyOptional({
    enum: [...CALENDAR_SYNC_DIRECTIONS],
    enumName: "CalendarSyncDirection",
  })
  @IsOptional()
  @IsIn(CALENDAR_SYNC_DIRECTIONS)
  syncDirection?: CalendarSyncDirection;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalendarSyncSelectionDto)
  calendars?: CalendarSyncSelectionDto[];
}
