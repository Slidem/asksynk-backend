import {
  BadRequestException,
  ExecutionContext,
  createParamDecorator,
} from "@nestjs/common";

import { isValidId } from "@asksynk/shared/src/id";

/**
 * Extracts a route param and validates it is a valid ULID.
 * Throws BadRequestException if the value is not a valid ULID.
 */
export const UlidParam = createParamDecorator(
  (param: string, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const value = request.params[param];
    if (!isValidId(value)) {
      throw new BadRequestException("Invalid ID");
    }
    return value;
  },
);
