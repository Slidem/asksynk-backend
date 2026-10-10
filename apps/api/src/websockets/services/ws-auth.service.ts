import { Injectable } from "@nestjs/common";
import { ContextLogger } from "nestjs-context-logger";
import { Socket } from "socket.io";

import { guestActor, userActor } from "@/api/auth/actor.mapper";
import { AuthService } from "@/api/auth/auth.service";
import { GuestAuthService } from "@/api/auth/guest-auth.service";
import { Actor } from "@/api/kernel/actor/actor";
import { extractBearerToken } from "@/api/platform/http/bearer-token";

@Injectable()
export class WsAuthService {
  private readonly logger = new ContextLogger(WsAuthService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly guestAuthService: GuestAuthService,
  ) {}

  async authenticateSocket(socket: Socket): Promise<Actor | null> {
    const headers = this.buildHeaderBag(socket);

    try {
      const session = await this.authService.validateRequest(headers);
      return userActor(session.user);
    } catch (userErr) {
      const token = extractBearerToken(headers);
      if (!token) {
        this.logger.debug("ws auth failed (no user session, no bearer)");
        return null;
      }
      try {
        const guest = await this.guestAuthService.validateToken(token);
        return guestActor(guest);
      } catch (guestErr) {
        this.logger.debug("ws auth failed for both user and guest", {
          userErr,
          guestErr,
        });
        return null;
      }
    }
  }

  private buildHeaderBag(
    socket: Socket,
  ): Record<string, string | string[] | undefined> {
    const headers: Record<string, string | string[] | undefined> = {
      ...socket.handshake.headers,
    };

    const tokenFromAuth =
      typeof socket.handshake.auth?.token === "string"
        ? socket.handshake.auth.token
        : undefined;

    if (tokenFromAuth && !headers.authorization) {
      headers.authorization = `Bearer ${tokenFromAuth}`;
    }

    return headers;
  }
}
