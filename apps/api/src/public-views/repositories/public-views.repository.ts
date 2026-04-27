import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { and, desc, eq, sql } from "drizzle-orm";

import { TxAdapter } from "@/api/infrastructure/db/tx.module";
import { PublicView } from "@/api/public-views/entities/public-view.entity";
import { publicViewGuests, publicViews } from "@/migrations/schema/publicViews";

type PublicViewRow = typeof publicViews.$inferSelect;

export type PublicViewWithStats = {
  view: PublicView;
  guestCount: number;
};

@Injectable()
export class PublicViewsRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  async insert(input: {
    id: string;
    ownerUserId: string;
    slug: string;
    name: string | null;
    expiresAt: Date;
  }): Promise<PublicView> {
    const [row] = await this.txHost.tx
      .insert(publicViews)
      .values({
        id: input.id,
        ownerUserId: input.ownerUserId,
        slug: input.slug,
        name: input.name,
        expiresAt: input.expiresAt,
      })
      .returning();
    return this.map(row);
  }

  async getById(id: string): Promise<PublicView | null> {
    const [row] = await this.txHost.tx
      .select()
      .from(publicViews)
      .where(eq(publicViews.id, id))
      .limit(1);
    return row ? this.map(row) : null;
  }

  async getBySlug(slug: string): Promise<PublicView | null> {
    const [row] = await this.txHost.tx
      .select()
      .from(publicViews)
      .where(eq(publicViews.slug, slug))
      .limit(1);
    return row ? this.map(row) : null;
  }

  async listForOwnerWithStats(
    ownerUserId: string,
  ): Promise<PublicViewWithStats[]> {
    const rows = await this.txHost.tx
      .select({
        row: publicViews,
        guestCount: sql<number>`count(${publicViewGuests.id})::int`,
      })
      .from(publicViews)
      .leftJoin(
        publicViewGuests,
        eq(publicViewGuests.publicViewId, publicViews.id),
      )
      .where(eq(publicViews.ownerUserId, ownerUserId))
      .groupBy(publicViews.id)
      .orderBy(desc(publicViews.createdAt));

    return rows.map((r) => ({
      view: this.map(r.row),
      guestCount: r.guestCount ?? 0,
    }));
  }

  async revoke(id: string, ownerUserId: string): Promise<PublicView | null> {
    const [row] = await this.txHost.tx
      .update(publicViews)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(publicViews.id, id), eq(publicViews.ownerUserId, ownerUserId)),
      )
      .returning();
    return row ? this.map(row) : null;
  }

  private map(row: PublicViewRow): PublicView {
    return PublicView.create({
      id: row.id,
      ownerUserId: row.ownerUserId,
      slug: row.slug,
      name: row.name,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
    });
  }
}
