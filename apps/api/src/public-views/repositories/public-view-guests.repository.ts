import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";

import { TxAdapter } from "@/api/infrastructure/db/tx.module";
import { PublicViewGuest } from "@/api/public-views/entities/public-view-guest.entity";
import { messages } from "@/migrations/schema/messaging";
import { publicViewGuests, publicViews } from "@/migrations/schema/publicViews";

type PublicViewGuestRow = typeof publicViewGuests.$inferSelect;

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

@Injectable()
export class PublicViewGuestsRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  async insert(input: {
    id: string;
    publicViewId: string;
    displayName: string;
    token: string;
    expiresAt: Date;
  }): Promise<PublicViewGuest> {
    const [row] = await this.txHost.tx
      .insert(publicViewGuests)
      .values({
        id: input.id,
        publicViewId: input.publicViewId,
        displayName: input.displayName,
        token: input.token,
        expiresAt: input.expiresAt,
      })
      .returning();
    return this.map(row);
  }

  async findActiveByToken(
    token: string,
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
          eq(publicViewGuests.token, token),
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

  async getById(id: string): Promise<PublicViewGuest | null> {
    const [row] = await this.txHost.tx
      .select()
      .from(publicViewGuests)
      .where(eq(publicViewGuests.id, id))
      .limit(1);
    return row ? this.map(row) : null;
  }

  async listForViewWithStats(publicViewId: string): Promise<GuestWithStats[]> {
    const rows = await this.txHost.tx
      .select({
        row: publicViewGuests,
        messageCount: sql<number>`count(${messages.id})::int`,
      })
      .from(publicViewGuests)
      .leftJoin(messages, eq(messages.senderGuestId, publicViewGuests.id))
      .where(eq(publicViewGuests.publicViewId, publicViewId))
      .groupBy(publicViewGuests.id)
      .orderBy(desc(publicViewGuests.createdAt));

    return rows.map((r) => ({
      guest: this.map(r.row),
      messageCount: r.messageCount ?? 0,
    }));
  }

  private map(row: PublicViewGuestRow): PublicViewGuest {
    return PublicViewGuest.create({
      id: row.id,
      publicViewId: row.publicViewId,
      displayName: row.displayName,
      token: row.token,
      expiresAt: row.expiresAt,
      lastSeenAt: row.lastSeenAt,
      createdAt: row.createdAt,
    });
  }
}
