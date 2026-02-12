import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import { AuthService } from "@/api/auth/auth.service";
import { IS_PUBLIC_KEY } from "@/api/auth/public.decorator";
import { Reflector } from "@nestjs/core";
import { RequestWithUser } from "@/api/auth/auth.types";

/**
 * AuthGuard is a NestJS guard that checks if the incoming request has a valid JWT token in the Authorization header.
 * It uses the AuthService to verify the token and extract the user information, which is then **attached to the request object**.
 * If the token is invalid or missing, it throws an UnauthorizedException.
 * The guard also checks for a custom decorator @Public() to allow unauthenticated access to specific routes.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();

    try {
      request.user = await this.authService.verifyToken(
        request.headers?.authorization,
      );
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException("Invalid token");
    }

    return true;
  }
}
