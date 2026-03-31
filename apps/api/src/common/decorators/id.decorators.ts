import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from "@nestjs/common";

import { isValidId } from "@/shared/id";

/**
 * Extracts a route param and validates it is a valid UUIDv7.
 * Throws BadRequestException if the value is not a valid UUIDv7.
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
