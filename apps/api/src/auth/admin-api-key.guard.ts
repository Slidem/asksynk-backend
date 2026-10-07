import { createHash, timingSafeEqual } from "node:crypto";

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";

export const ADMIN_API_KEY_HEADER = "x-admin-api-key";
const MIN_KEY_LENGTH = 32;

/** Checks `x-admin-api-key` against `ADMIN_API_KEY`. Fails closed when the key is unset or too short. */
@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>("ADMIN_API_KEY");
    const raw = context.switchToHttp().getRequest<Request>().headers[
      ADMIN_API_KEY_HEADER
    ];
    const provided = Array.isArray(raw) ? raw[0] : raw;

    if (
      !expected ||
      expected.length < MIN_KEY_LENGTH ||
      !provided ||
      !safeEqual(provided, expected)
    ) {
      throw new UnauthorizedException("Authentication failed");
    }

    return true;
  }
}

/** Hashing first gives equal-length buffers, as timingSafeEqual requires. */
function safeEqual(a: string, b: string): boolean {
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(a), hash(b));
}
