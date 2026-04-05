import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

import {
  IsIanaTimezone,
  IsIsoDateWithOffset,
  IsUuidV7,
} from "@/api/common/decorators/validators";

export class CreateCalendarEventRequestDto {
  @IsUuidV7()
  id!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  link?: string;

  /** ISO 8601 with offset: "2026-03-15T10:00:00+02:00" */
  @IsIsoDateWithOffset()
  start!: string;

  @IsInt()
  @Min(0)
  durationSeconds!: number;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  /** IANA timezone: "Europe/Bucharest" */
  @IsIanaTimezone()
  timezone!: string;

  @IsOptional()
  @IsString()
  rrule?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}
