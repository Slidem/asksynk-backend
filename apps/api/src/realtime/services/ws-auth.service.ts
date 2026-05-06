import { Injectable } from "@nestjs/common";
import { ContextLogger } from "nestjs-context-logger";
import { Socket } from "socket.io";

import { AuthService } from "@/api/auth/auth.service";
import { AuthGuest, AuthUser } from "@/api/auth/auth.types";
import { GuestAuthService } from "@/api/auth/guest-auth.service";
import { extractBearerToken } from "@/api/common/utils/token";

export type WsIdentity =
  | { kind: "user"; user: AuthUser }
  | { kind: "guest"; guest: AuthGuest };

@Injectable()
export class WsAuthService {
  private readonly logger = new ContextLogger(WsAuthService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly guestAuthService: GuestAuthService,
  ) {}

  async authenticateSocket(socket: Socket): Promise<WsIdentity | null> {
    const headers = this.buildHeaderBag(socket);

    try {
      const session = await this.authService.validateRequest(headers);
      return { kind: "user", user: session.user };
    } catch (userErr) {
      const token = extractBearerToken(headers);
      if (!token) {
        this.logger.debug("ws auth failed (no user session, no bearer)");
        return null;
      }
      try {
        const guest = await this.guestAuthService.validateToken(token);
        return { kind: "guest", guest };
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
