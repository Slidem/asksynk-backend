import { registerDecorator, ValidationOptions } from "class-validator";

import {
  isIsoDateWithOffset,
  isValidIanaTimezone,
} from "@/api/kernel/time/iso";
import { isValidId } from "@/shared/id";

/**
 * Class validator decorator to validate that a string is a valid UUIDv7.
 * @param validationOptions Optional validation options.
 * @returns A property decorator function.
 */

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
/**
 * Class validator decorator to validate that a string is a valid IANA timezone.
 *
 * @param validationOptions
 * @returns A property decorator function.
 */

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
/**
 * Class validator decorator to validate that a string is an ISO 8601 date with offset.
 *
 * @param validationOptions
 * @returns A property decorator function.
 */

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
