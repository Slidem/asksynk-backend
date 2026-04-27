import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import { RequestWithAuth } from "@/api/auth/auth.types";

export const AuthGuest = createParamDecorator(
  (_: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    return request.guest;
  },
);
