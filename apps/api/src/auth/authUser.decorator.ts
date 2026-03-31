import { createParamDecorator,ExecutionContext } from "@nestjs/common";

import { RequestWithUser } from "@/api/auth/auth.types";

export const AuthUser = createParamDecorator(
  (_: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
