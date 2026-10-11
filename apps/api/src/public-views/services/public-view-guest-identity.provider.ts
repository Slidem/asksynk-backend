import { Injectable, OnModuleInit } from "@nestjs/common";

import {
  GuestIdentityProvider,
  GuestIdentityRegistry,
  GuestPrincipal,
} from "@/api/auth/contract/guest-identity.provider";
import { PublicViewGuestsRepository } from "@/api/public-views/domain/ports/public-view-guests.repository";
import { hashGuestToken } from "@/api/public-views/utils/slug.util";

const LAST_SEEN_THROTTLE_INTERVAL = "2 minutes";

/** Guest tokens are issued here (sign-in), so they're validated here too. */
@Injectable()
export class PublicViewGuestIdentityProvider
  implements GuestIdentityProvider, OnModuleInit
{
  constructor(
    private readonly registry: GuestIdentityRegistry,
    private readonly publicViewGuestsRepository: PublicViewGuestsRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async validateToken(token: string): Promise<GuestPrincipal | null> {
    const now = new Date();

    const row = await this.publicViewGuestsRepository.findActiveByTokenHash(
      hashGuestToken(token),
      now,
    );

    if (!row) {
      return null;
    }

    await this.publicViewGuestsRepository.touchLastSeen(
      row.guestId,
      now,
      LAST_SEEN_THROTTLE_INTERVAL,
    );

    return {
      guestId: row.guestId,
      publicViewId: row.publicViewId,
      ownerUserId: row.ownerUserId,
      displayName: row.displayName,
      expiresAt: row.guestExpiresAt,
    };
  }
}
