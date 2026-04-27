import { Injectable, UnauthorizedException } from "@nestjs/common";

import { AuthGuest } from "@/api/auth/auth.types";
import { PublicViewGuestsRepository } from "@/api/public-views/repositories/public-view-guests.repository";

const LAST_SEEN_THROTTLE_INTERVAL = "2 minutes";

@Injectable()
export class GuestAuthService {
  constructor(
    private readonly publicViewGuestsRepository: PublicViewGuestsRepository,
  ) {}

  async validateToken(token: string): Promise<AuthGuest> {
    const now = new Date();

    const row = await this.publicViewGuestsRepository.findActiveByToken(
      token,
      now,
    );

    if (!row) {
      throw new UnauthorizedException("Invalid or expired guest session");
    }

    await this.publicViewGuestsRepository.touchLastSeen(
      row.guestId,
      now,
      LAST_SEEN_THROTTLE_INTERVAL,
    );

    return {
      id: row.guestId,
      publicViewId: row.publicViewId,
      ownerUserId: row.ownerUserId,
      displayName: row.displayName,
      expiresAt: row.guestExpiresAt,
    };
  }
}
