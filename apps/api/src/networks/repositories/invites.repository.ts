import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { and, desc, eq } from "drizzle-orm";

import { TxAdapter } from "@/api/infrastructure/db/tx.module";
import { Invite, InviteStatus } from "@/api/networks/entities/invite.entity";
import { userInvites } from "@/migrations/schema/userNetwork";

type InviteRow = typeof userInvites.$inferSelect;

@Injectable()
export class InvitesRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  async add(input: {
    id: string;
    inviterUserId: string;
    inviteeEmail: string;
  }): Promise<Invite> {
    const [row] = await this.txHost.tx
      .insert(userInvites)
      .values({
        id: input.id,
        inviterUserId: input.inviterUserId,
        inviteeEmail: input.inviteeEmail.toLowerCase(),
      })
      .returning();
    return this.map(row);
  }

  async getById(id: string): Promise<Invite | null> {
    const [row] = await this.txHost.tx
      .select()
      .from(userInvites)
      .where(eq(userInvites.id, id))
      .limit(1);
    return row ? this.map(row) : null;
  }

  async updateStatus(id: string, status: InviteStatus): Promise<Invite | null> {
    const [row] = await this.txHost.tx
      .update(userInvites)
      .set({ status, updatedAt: new Date() })
      .where(eq(userInvites.id, id))
      .returning();
    return row ? this.map(row) : null;
  }

  async listForInviter(inviterUserId: string): Promise<Invite[]> {
    const rows = await this.txHost.tx
      .select()
      .from(userInvites)
      .where(eq(userInvites.inviterUserId, inviterUserId))
      .orderBy(desc(userInvites.createdAt));
    return rows.map((r) => this.map(r));
  }

  async listForInviteeEmail(email: string): Promise<Invite[]> {
    const rows = await this.txHost.tx
      .select()
      .from(userInvites)
      .where(eq(userInvites.inviteeEmail, email.toLowerCase()))
      .orderBy(desc(userInvites.createdAt));
    return rows.map((r) => this.map(r));
  }

  async findPending(
    inviterUserId: string,
    inviteeEmail: string,
  ): Promise<Invite | null> {
    const [row] = await this.txHost.tx
      .select()
      .from(userInvites)
      .where(
        and(
          eq(userInvites.inviterUserId, inviterUserId),
          eq(userInvites.inviteeEmail, inviteeEmail.toLowerCase()),
          eq(userInvites.status, "pending"),
        ),
      )
      .limit(1);
    return row ? this.map(row) : null;
  }

  private map(row: InviteRow): Invite {
    return Invite.create({
      id: row.id,
      inviterUserId: row.inviterUserId,
      inviteeEmail: row.inviteeEmail,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
