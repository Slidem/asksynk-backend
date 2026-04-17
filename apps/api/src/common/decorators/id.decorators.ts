import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import { isIsoDateWithOffset } from "@/api/calendar-events/utils/recurrence.utils";
import { AsksynkError } from "@/api/common/errors/errors.model";
import { isValidId } from "@/shared/id";

export const UuidV7Param = createParamDecorator(
  (param: string, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const value = request.params[param];
    if (!isValidId(value)) {
      throw AsksynkError.badRequest("Invalid ID");
    }
    return value;
  },
);

export const IsoDateWithOffsetParam = createParamDecorator(
  (param: string, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const value = request.params[param];
    if (!isIsoDateWithOffset(value)) {
      throw AsksynkError.badRequest(
        "Invalid ISO 8601 date with offset (e.g. 2026-03-15T10:00:00+02:00)",
      );
    }
    return value;
  },
);
