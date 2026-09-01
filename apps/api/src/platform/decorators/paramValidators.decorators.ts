import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from "@nestjs/common";
import { isValidId } from "src/kernel/id";

import { isIsoDateWithOffset } from "@/api/kernel/time/iso";

/**
 * Param decorator to validate that a string is a valid UUIDv7.
 */
export const UuidV7Param = createParamDecorator(
  (param: string, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const value = request.params[param];
    if (!isValidId(value)) {
      throw new BadRequestException("Invalid ID");
    }
    return value;
  },
);

/**
 * Param decorator to validate that a string is a valid IANA timezone.
 */
export const IsoDateWithOffsetParam = createParamDecorator(
  (param: string, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const value = request.params[param];
    if (!isIsoDateWithOffset(value)) {
      throw new BadRequestException(
        "Invalid ISO 8601 date with offset (e.g. 2026-03-15T10:00:00+02:00)",
      );
    }
    return value;
  },
);
