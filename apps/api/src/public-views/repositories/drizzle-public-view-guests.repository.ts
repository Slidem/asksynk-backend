import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { TxAdapter } from "@/api/platform/db/tx.module";
import {
  ActiveGuestSession,
  GuestWithStats,
  PublicViewGuestsRepository,
} from "@/api/public-views/domain/ports/public-view-guests.repository";
import { PublicViewGuest } from "@/api/public-views/entities/public-view-guest.entity";
import { publicViewGuests, publicViews } from "@/migrations/schema/publicViews";

type PublicViewGuestRow = typeof publicViewGuests.$inferSelect;

@Injectable()
export class DrizzlePublicViewGuestsRepository extends PublicViewGuestsRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {
    super();
  }

  async insert(input: {
    id: string;
    publicViewId: string;
    displayName: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PublicViewGuest> {
    const [row] = await this.txHost.tx
      .insert(publicViewGuests)
      .values({
        id: input.id,
        publicViewId: input.publicViewId,
        displayName: input.displayName,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      })
      .returning();
    return this.map(row);
  }

  async findActiveByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<ActiveGuestSession | null> {
    const [row] = await this.txHost.tx
      .select({
        guestId: publicViewGuests.id,
        guestExpiresAt: publicViewGuests.expiresAt,
        displayName: publicViewGuests.displayName,
        publicViewId: publicViews.id,
        ownerUserId: publicViews.ownerUserId,
        viewExpiresAt: publicViews.expiresAt,
        viewRevokedAt: publicViews.revokedAt,
      })
      .from(publicViewGuests)
      .innerJoin(publicViews, eq(publicViewGuests.publicViewId, publicViews.id))
      .where(
        and(
          eq(publicViewGuests.tokenHash, tokenHash),
          gt(publicViewGuests.expiresAt, now),
          gt(publicViews.expiresAt, now),
          isNull(publicViews.revokedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async touchLastSeen(
    guestId: string,
    now: Date,
    throttleInterval: string,
  ): Promise<void> {
    await this.txHost.tx
      .update(publicViewGuests)
      .set({ lastSeenAt: now })
      .where(
        and(
          eq(publicViewGuests.id, guestId),
          lt(
            publicViewGuests.lastSeenAt,
            sql`now() - interval '${sql.raw(throttleInterval)}'`,
          ),
        ),
      );
  }

  async getByIds(ids: string[]): Promise<PublicViewGuest[]> {
    if (ids.length === 0) return [];
    const rows = await this.txHost.tx
      .select()
      .from(publicViewGuests)
      .where(inArray(publicViewGuests.id, ids));
    return rows.map((r) => this.map(r));
  }

  async listForViewWithStats(publicViewId: string): Promise<GuestWithStats[]> {
    const rows = await this.txHost.tx
      .select()
      .from(publicViewGuests)
      .where(eq(publicViewGuests.publicViewId, publicViewId))
      .orderBy(desc(publicViewGuests.createdAt));

    return rows.map((r) => ({
      guest: this.map(r),
      messageCount: r.messageCount,
    }));
  }

  // Idempotent: counts `messageId` only if newer than the last one counted.
  async countMessage(guestId: string, messageId: string): Promise<void> {
    await this.txHost.tx
      .update(publicViewGuests)
      .set({
        messageCount: sql`${publicViewGuests.messageCount} + 1`,
        lastCountedMessageId: messageId,
      })
      .where(
        and(
          eq(publicViewGuests.id, guestId),
          or(
            isNull(publicViewGuests.lastCountedMessageId),
            lt(publicViewGuests.lastCountedMessageId, messageId),
          ),
        ),
      );
  }

  private map(row: PublicViewGuestRow): PublicViewGuest {
    return PublicViewGuest.create({
      id: row.id,
      publicViewId: row.publicViewId,
      displayName: row.displayName,
      expiresAt: row.expiresAt,
      lastSeenAt: row.lastSeenAt,
      createdAt: row.createdAt,
    });
  }
}
