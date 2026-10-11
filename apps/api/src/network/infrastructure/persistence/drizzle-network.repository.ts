import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { NetworkConnection } from "@/api/network/domain/network-connection";
import {
  NetworkRepository,
} from "@/api/network/domain/ports/network.repository";
import { TxAdapter } from "@/api/platform/db/tx.module";
import { userNetwork } from "@/migrations/schema/userNetwork";
import { users } from "@/migrations/schema/users";

@Injectable()
export class DrizzleNetworkRepository extends NetworkRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {
    super();
  }

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
      .where(and(eq(userNetwork.userId, userId), isNull(userNetwork.removedAt)))
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

  // Active connection = both directed rows present and not removed.
  async connectedAmong(
    userId: string,
    otherUserIds: string[],
  ): Promise<Set<string>> {
    const [outgoing, incoming] = await Promise.all([
      this.txHost.tx
        .select({ id: userNetwork.connectionId })
        .from(userNetwork)
        .where(
          and(
            eq(userNetwork.userId, userId),
            inArray(userNetwork.connectionId, otherUserIds),
            isNull(userNetwork.removedAt),
          ),
        ),
      this.txHost.tx
        .select({ id: userNetwork.userId })
        .from(userNetwork)
        .where(
          and(
            eq(userNetwork.connectionId, userId),
            inArray(userNetwork.userId, otherUserIds),
            isNull(userNetwork.removedAt),
          ),
        ),
    ]);
    const back = new Set(incoming.map((r) => r.id));
    return new Set(outgoing.map((r) => r.id).filter((id) => back.has(id)));
  }

  async isActiveConnection(userIdA: string, userIdB: string): Promise<boolean> {
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
