import { Injectable } from "@nestjs/common";
import { ContextLogger } from "nestjs-context-logger";

import { AuthService } from "@/api/auth/application/auth.service";
import { GuestAuthService } from "@/api/auth/application/guest-auth.service";
import { ActorAuthenticator } from "@/api/auth/contract/actor-authenticator.port";
import { Actor } from "@/api/kernel/actor/actor";
import { guestActor, userActor } from "@/api/platform/http/auth/actor.mapper";
import { RequestHeaders } from "@/api/platform/http/auth/auth.types";
import { extractBearerToken } from "@/api/platform/http/bearer-token";

@Injectable()
export class ActorAuthenticatorService extends ActorAuthenticator {
  private readonly logger = new ContextLogger(ActorAuthenticatorService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly guestAuthService: GuestAuthService,
  ) {
    super();
  }

  async authenticate(headers: RequestHeaders): Promise<Actor | null> {
    try {
      const session = await this.authService.validateRequest(headers);
      return userActor(session.user);
    } catch (userErr) {
      const token = extractBearerToken(headers);
      if (!token) {
        this.logger.debug("auth failed (no user session, no bearer)");
        return null;
      }
      try {
        const guest = await this.guestAuthService.validateToken(token);
        return guestActor(guest);
      } catch (guestErr) {
        this.logger.debug("auth failed for both user and guest", {
          userErr,
          guestErr,
        });
        return null;
      }
    }
  }
}
