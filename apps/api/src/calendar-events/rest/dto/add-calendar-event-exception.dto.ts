import { IsIsoDateWithOffset } from "@/api/common/decorators/validators";

export class AddCalendarEventExceptionRequestDto {
  /** ISO 8601 with offset of the occurrence to cancel: "2026-03-15T10:00:00+02:00" */
  @IsIsoDateWithOffset()
  occurrenceStart!: string;
}
