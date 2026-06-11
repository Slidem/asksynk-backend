import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  ValidateNested,
} from "class-validator";

import { IsUuidV7 } from "@/api/common/decorators/validators";

export class CalendarSyncSelectionDto {
  @IsUuidV7()
  calendarId!: string;

  @IsBoolean()
  syncEnabled!: boolean;
}

export class UpdateIntegrationRequestDto {
  @IsOptional()
  @IsIn(["bidirectional", "readonly"])
  syncDirection?: "bidirectional" | "readonly";

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalendarSyncSelectionDto)
  calendars?: CalendarSyncSelectionDto[];
}
