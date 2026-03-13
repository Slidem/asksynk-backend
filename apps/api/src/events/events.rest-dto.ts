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
  @IsString()
  @IsNotEmpty()
  start!: string;

  @IsInt()
  @Min(0)
  durationSeconds!: number;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  /** IANA timezone: "Europe/Bucharest" */
  @IsString()
  @IsNotEmpty()
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

  // maybe validation here so we are sure have iso string ?
  @IsOptional()
  @IsString()
  start?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  // TODO: any way to actually use a "IANA" timezone type here .. either custom or something from let's say date-fns or something...
  @IsOptional()
  @IsString()
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
  /** ISO 8601 window start */
  // TODO: shouldn't this actually be compacted iso ??????
  @IsString()
  @IsNotEmpty()
  start!: string;

  /** ISO 8601 window end */
  @IsString()
  @IsNotEmpty()
  end!: string;
}

export class AddExceptionRequestDto {
  /** ISO 8601 of the occurrence to cancel */
  @IsString()
  @IsNotEmpty()
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
  @IsString()
  start?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  @IsOptional()
  @IsString()
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
  @IsString()
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
