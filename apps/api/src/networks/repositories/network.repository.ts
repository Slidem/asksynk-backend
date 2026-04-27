import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";

import { TxAdapter } from "@/api/infrastructure/db/tx.module";
import { NetworkConnection } from "@/api/networks/entities/network-connection.entity";
import { userNetwork } from "@/migrations/schema/userNetwork";
import { users } from "@/migrations/schema/users";

@Injectable()
export class NetworkRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  async upsertPair(userIdA: string, userIdB: string): Promise<void> {
    await this.txHost.tx
      .insert(userNetwork)
      .values([
        { userId: userIdA, connectionId: userIdB },
        { userId: userIdB, connectionId: userIdA },
      ])
      .onConflictDoUpdate({
        target: [userNetwork.userId, userNetwork.connectionId],
        set: { removedAt: null, createdAt: sql`now()` },
      });
  }

  async softRemovePair(userIdA: string, userIdB: string): Promise<void> {
    const now = new Date();
    await this.txHost.tx
      .update(userNetwork)
      .set({ removedAt: now })
      .where(
        or(
          and(
            eq(userNetwork.userId, userIdA),
            eq(userNetwork.connectionId, userIdB),
          ),
          and(
            eq(userNetwork.userId, userIdB),
            eq(userNetwork.connectionId, userIdA),
          ),
        ),
      );
  }

  async listActiveConnections(userId: string): Promise<NetworkConnection[]> {
    const rows = await this.txHost.tx
      .select({
        userId: userNetwork.userId,
        connectionId: userNetwork.connectionId,
        createdAt: userNetwork.createdAt,
        name: users.name,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        image: users.image,
      })
      .from(userNetwork)
      .innerJoin(users, eq(userNetwork.connectionId, users.id))
      .where(
        and(eq(userNetwork.userId, userId), isNull(userNetwork.removedAt)),
      )
      .orderBy(asc(userNetwork.createdAt));

    return rows.map((r) =>
      NetworkConnection.create({
        userId: r.userId,
        connectionId: r.connectionId,
        name: r.name,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        image: r.image,
        connectedAt: r.createdAt,
      }),
    );
  }

  async isActiveConnection(
    userIdA: string,
    userIdB: string,
  ): Promise<boolean> {
    const rows = await this.txHost.tx
      .select({ userId: userNetwork.userId })
      .from(userNetwork)
      .where(
        and(
          or(
            and(
              eq(userNetwork.userId, userIdA),
              eq(userNetwork.connectionId, userIdB),
            ),
            and(
              eq(userNetwork.userId, userIdB),
              eq(userNetwork.connectionId, userIdA),
            ),
          ),
          isNull(userNetwork.removedAt),
        ),
      );
    return rows.length === 2;
  }
}
