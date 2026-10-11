import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";

import { Actor } from "@/api/kernel/actor/actor";
import { guestActor, userActor } from "@/api/platform/http/auth/actor.mapper";
import { RequestWithAuth } from "@/api/platform/http/auth/auth.types";

export const RequestActor = createParamDecorator(
  (_: unknown, context: ExecutionContext): Actor => {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    if (request.user && request.guest) {
      throw new UnauthorizedException(
        "Invalid authentication state: both user and guest are present",
      );
    }
    if (request.guest) {
      return guestActor(request.guest);
    }
    if (request.user) {
      return userActor(request.user);
    }
    throw new UnauthorizedException("No authenticated principal");
  },
);
