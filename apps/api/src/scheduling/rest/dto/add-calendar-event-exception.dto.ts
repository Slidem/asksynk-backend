import { IsIsoDateWithOffset } from "@/api/platform/decorators/fieldValidators.decorators";

export class AddCalendarEventExceptionRequestDto {
  /** ISO 8601 with offset of the occurrence to cancel: "2026-03-15T10:00:00+02:00" */
  @IsIsoDateWithOffset()
  occurrenceStart!: string;
}
