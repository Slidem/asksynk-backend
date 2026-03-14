import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidationOptions,
  registerDecorator,
} from "class-validator";
import {
  isIsoDateWithOffset,
  isValidIanaTimezone,
} from "@/api/events/recurrence.utils";

import { isValidId } from "@/shared/id";

function IsUuidV7(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isUuidV7",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      target: (object as any).constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === "string" && isValidId(value);
        },
        defaultMessage(): string {
          return "$property must be a valid UUIDv7";
        },
      },
    });
  };
}

function IsIanaTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isIanaTimezone",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      target: (object as any).constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === "string" && isValidIanaTimezone(value);
        },
        defaultMessage(): string {
          return "$property must be a valid IANA timezone (e.g. Europe/Bucharest)";
        },
      },
    });
  };
}

function IsIsoDateWithOffset(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isIsoDateWithOffset",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      target: (object as any).constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === "string" && isIsoDateWithOffset(value);
        },
        defaultMessage(): string {
          return "$property must be an ISO 8601 date with offset (e.g. 2026-03-15T10:00:00+02:00)";
        },
      },
    });
  };
}

export class CreateEventRequestDto {
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

export class UpdateEventRequestDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  link?: string;

  @IsOptional()
  @IsIsoDateWithOffset()
  start?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;

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

export class ListEventsQueryDto {
  /** ISO 8601 with offset window start: "2026-03-15T00:00:00+02:00" */
  @IsIsoDateWithOffset()
  start!: string;

  /** ISO 8601 with offset window end: "2026-03-16T00:00:00+02:00" */
  @IsIsoDateWithOffset()
  end!: string;

  /** IANA timezone — source of truth for interpreting start/end wall-clock: "Europe/Bucharest" */
  @IsIanaTimezone()
  timezone!: string;
}

export class AddExceptionRequestDto {
  /** ISO 8601 with offset of the occurrence to cancel: "2026-03-15T10:00:00+02:00" */
  @IsIsoDateWithOffset()
  occurrenceStart!: string;
}

export class UpdateInstanceRequestDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  link?: string;

  @IsOptional()
  @IsIsoDateWithOffset()
  start?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}

export class SplitSeriesRequestDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  link?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;

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

export interface CalendarResponseDto {
  id: string;
  userId: string;
  source: string;
  color: string | null;
}

export interface EventResponseDto {
  id: string;
  calendarId: string;
  title: string;
  description: string | null;
  location: string | null;
  link: string | null;
  start: string;
  end: string;
  durationSeconds: number;
  allDay: boolean;
  timezone: string;
  rrule: string | null;
  color: string | null;
  isRecurring: boolean;
  tagIds: string[];
}

export interface EventInstanceResponseDto {
  eventId: string;
  title: string;
  description: string | null;
  location: string | null;
  link: string | null;
  instanceStart: string;
  instanceEnd: string;
  durationSeconds: number;
  allDay: boolean;
  timezone: string;
  color: string | null;
  tagIds: string[];
}
