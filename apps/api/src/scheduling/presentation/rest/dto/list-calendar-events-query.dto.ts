import { Transform } from "class-transformer";
import { IsOptional, IsUUID } from "class-validator";

import { IsIsoDateWithOffset } from "@/api/platform/decorators/fieldValidators.decorators";

export class ListCalendarEventsQueryDto {
  /** ISO 8601 with offset window start: "2026-03-15T00:00:00+02:00" */
  @IsIsoDateWithOffset()
  start!: string;

  /** User ID of the calendar to view (connection or self); defaults to caller */
  @IsOptional()
  userId?: string;

  /** ISO 8601 with offset window end: "2026-03-16T00:00:00+02:00" */
  @IsIsoDateWithOffset()
  end!: string;

  @IsOptional()
  @IsUUID("all", { each: true })
  @Transform(({ value }) => (typeof value === "string" ? [value] : value))
  tagIds?: string[];

  /** Optional: only return events from this calendar (default: all the user's calendars) */
  @IsOptional()
  @IsUUID()
  calendarId?: string;
}
