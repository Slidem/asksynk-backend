import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";

import {
  RequestActor as RequestActorType,
  RequestWithAuth,
} from "@/api/auth/auth.types";

export const RequestActor = createParamDecorator(
  (_: unknown, context: ExecutionContext): RequestActorType => {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    if (request.user && request.guest) {
      throw new UnauthorizedException(
        "Invalid authentication state: both user and guest are present",
      );
    }
    if (request.guest) {
      return { guest: request.guest, isGuest: true };
    }
    if (request.user) {
      return { user: request.user, isGuest: false };
    }
    throw new UnauthorizedException("No authenticated principal");
  },
);
