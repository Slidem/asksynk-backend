import { Transform } from "class-transformer";
import { IsOptional, IsUUID } from "class-validator";

import {
  IsIanaTimezone,
  IsIsoDateWithOffset,
} from "@/api/common/decorators/validators";

export class ListCalendarEventsQueryDto {
  /** ISO 8601 with offset window start: "2026-03-15T00:00:00+02:00" */
  @IsIsoDateWithOffset()
  start!: string;

  /** ISO 8601 with offset window end: "2026-03-16T00:00:00+02:00" */
  @IsIsoDateWithOffset()
  end!: string;

  /** IANA timezone — source of truth for interpreting start/end wall-clock: "Europe/Bucharest" */
  @IsIanaTimezone()
  timezone!: string;

  @IsOptional()
  @IsUUID("all", { each: true })
  @Transform(({ value }) => (typeof value === "string" ? [value] : value))
  tagIds?: string[];
}
