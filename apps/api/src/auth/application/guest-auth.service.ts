import { Injectable, UnauthorizedException } from "@nestjs/common";

import {
  GuestIdentityProvider,
  GuestIdentityRegistry,
} from "@/api/auth/contract/guest-identity.provider";
import { AuthGuest } from "@/api/platform/http/auth/auth.types";

@Injectable()
export class GuestAuthService extends GuestIdentityRegistry {
  private provider: GuestIdentityProvider | null = null;

  register(provider: GuestIdentityProvider): void {
    this.provider = provider;
  }

  async validateToken(token: string): Promise<AuthGuest> {
    const principal = await this.provider?.validateToken(token);

    if (!principal) {
      throw new UnauthorizedException("Invalid or expired guest session");
    }

    return {
      id: principal.guestId,
      publicViewId: principal.publicViewId,
      ownerUserId: principal.ownerUserId,
      displayName: principal.displayName,
      expiresAt: principal.expiresAt,
    };
  }
}
