import { registerDecorator, ValidationOptions } from "class-validator";

import {
  isIsoDateWithOffset,
  isValidIanaTimezone,
} from "@/api/calendar-events/utils/recurrence.utils";
import { isValidId } from "@/shared/id";

export function IsUuidV7(validationOptions?: ValidationOptions) {
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

export function IsIanaTimezone(validationOptions?: ValidationOptions) {
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

export function IsIsoDateWithOffset(validationOptions?: ValidationOptions) {
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
