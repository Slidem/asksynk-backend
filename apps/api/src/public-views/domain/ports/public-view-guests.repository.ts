import { PublicViewGuest } from "@/api/public-views/entities/public-view-guest.entity";

export type GuestWithStats = {
  guest: PublicViewGuest;
  messageCount: number;
};

export type ActiveGuestSession = {
  guestId: string;
  guestExpiresAt: Date;
  displayName: string;
  publicViewId: string;
  ownerUserId: string;
  viewExpiresAt: Date;
  viewRevokedAt: Date | null;
};

export abstract class PublicViewGuestsRepository {
  abstract insert(input: {
    id: string;
    publicViewId: string;
    displayName: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PublicViewGuest>;
  abstract findActiveByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<ActiveGuestSession | null>;
  abstract touchLastSeen(
    guestId: string,
    now: Date,
    throttleInterval: string,
  ): Promise<void>;
  abstract getByIds(ids: string[]): Promise<PublicViewGuest[]>;
  abstract listForViewWithStats(publicViewId: string): Promise<GuestWithStats[]>;
  abstract countMessage(guestId: string, messageId: string): Promise<void>;
}
