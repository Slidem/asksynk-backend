import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ContextLogger } from "nestjs-context-logger";

import { ALLOW_GUEST_KEY } from "@/api/auth/allowGuest.decorator";
import { AuthService } from "@/api/auth/auth.service";
import { RequestHeaders, RequestWithAuth } from "@/api/auth/auth.types";
import { GuestAuthService } from "@/api/auth/guest-auth.service";
import { IS_PUBLIC_KEY } from "@/api/auth/public.decorator";

import { CalendarEventsRepository } from "../calendar-events/repositories/calendar-events.repository";
import { extractBearerToken } from "../common/utils/token";

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new ContextLogger(CalendarEventsRepository.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
    private readonly guestAuthService: GuestAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const headers = request.headers as RequestHeaders;

    try {
      return await this.isValidAuthenticatedUser(headers, request);
    } catch (userAuthError) {
      if (this.methodAllowsGuests(context)) {
        return await this.isValidGuestUser(headers, request);
      }

      if (userAuthError instanceof UnauthorizedException) {
        throw userAuthError;
      }

      this.logger.info("Error validating authenticated user", {
        error: userAuthError,
      });

      throw new UnauthorizedException("Authentication failed");
    }
  }

  private methodAllowsGuests(context: ExecutionContext) {
    return this.reflector.getAllAndOverride<boolean>(ALLOW_GUEST_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  }

  private async isValidAuthenticatedUser(
    headers: Record<string, string | string[] | undefined>,
    request: RequestWithAuth,
  ) {
    const authSession = await this.authService.validateRequest(headers);
    request.user = authSession.user;
    request.session = authSession;
    return true;
  }

  private async isValidGuestUser(
    headers: Record<string, string | string[] | undefined>,
    request: RequestWithAuth,
  ) {
    const token = extractBearerToken(headers);
    if (!token) throw new UnauthorizedException("Missing bearer token");

    // NOTE: rate-limit hook — invoke RateLimiter here before token lookup when added.
    request.guest = await this.guestAuthService.validateToken(token);
    return true;
  }
}
