import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import _ from "lodash";

import { TxAdapter } from "@/api/infrastructure/db/tx.module";
import {
  Message,
  MessageSender,
} from "@/api/messaging/entities/message.entity";
import { Thread } from "@/api/messaging/entities/thread.entity";
import { messageTags } from "@/migrations/schema/messageTags";
import {
  messageAttachments,
  messages,
  messageThreads,
  threadParticipants,
} from "@/migrations/schema/messaging";

type ThreadRow = typeof messageThreads.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

export type ThreadParticipantRow = {
  threadId: string;
  userId: string | null;
  guestId: string | null;
};

export type OtherParticipantView =
  | {
      kind: "user";
      userId: string;
      name: string | null;
      firstName: string | null;
      lastName: string | null;
      email: string;
      image: string | null;
      isActiveConnection: boolean;
    }
  | {
      kind: "guest";
      guestId: string;
      displayName: string;
      publicViewId: string;
      publicViewName: string | null;
      publicViewExpired: boolean;
    };

export type ThreadListItem = {
  thread: Thread;
  other: OtherParticipantView;
  lastMessage: {
    body: string;
    createdAt: Date;
    senderKind: "user" | "guest";
  } | null;
};

export type ThreadMessageListItem = {
  message: Message;
  replyCount: number;
};

@Injectable()
export class MessagingRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  async insertThread(input: {
    id: string;
    publicViewId: string | null;
  }): Promise<Thread> {
    const [row] = await this.txHost.tx
      .insert(messageThreads)
      .values({ id: input.id, publicViewId: input.publicViewId })
      .returning();

    return this.mapThread(row);
  }

  async getThread(threadId: string): Promise<Thread | null> {
    const [row] = await this.txHost.tx
      .select()
      .from(messageThreads)
      .where(eq(messageThreads.id, threadId))
      .limit(1);

    return row ? this.mapThread(row) : null;
  }

  async insertParticipants(rows: ThreadParticipantRow[]): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    await this.txHost.tx.insert(threadParticipants).values(rows);
  }

  async getParticipants(threadId: string): Promise<ThreadParticipantRow[]> {
    return this.txHost.tx
      .select({
        threadId: threadParticipants.threadId,
        userId: threadParticipants.userId,
        guestId: threadParticipants.guestId,
      })
      .from(threadParticipants)
      .where(eq(threadParticipants.threadId, threadId));
  }

  async findUserPairThread(
    userIdA: string,
    userIdB: string,
  ): Promise<Thread | null> {
    const rows = await this.txHost.tx.execute(sql`
      select t.*
      from message_threads t
      where t.public_view_id is null
        and exists (
          select 1 from thread_participants p1
          where p1.thread_id = t.id and p1.user_id = ${userIdA}
        )
        and exists (
          select 1 from thread_participants p2
          where p2.thread_id = t.id and p2.user_id = ${userIdB}
        )
        and (
          select count(*) from thread_participants pc
          where pc.thread_id = t.id
        ) = 2
      limit 1
    `);
    const row = (rows as unknown as { rows: ThreadRow[] }).rows[0];
    return row ? this.mapThread(row) : null;
  }

  async findGuestThread(guestId: string): Promise<Thread | null> {
    const [row] = await this.txHost.tx
      .select({
        id: messageThreads.id,
        publicViewId: messageThreads.publicViewId,
        createdAt: messageThreads.createdAt,
      })
      .from(messageThreads)
      .innerJoin(
        threadParticipants,
        eq(threadParticipants.threadId, messageThreads.id),
      )
      .where(eq(threadParticipants.guestId, guestId))
      .limit(1);
    return row ? this.mapThread(row) : null;
  }

  async isUserParticipant(threadId: string, userId: string): Promise<boolean> {
    const [row] = await this.txHost.tx
      .select({ threadId: threadParticipants.threadId })
      .from(threadParticipants)
      .where(
        and(
          eq(threadParticipants.threadId, threadId),
          eq(threadParticipants.userId, userId),
        ),
      )
      .limit(1);
    return !!row;
  }

  async insertMessage(input: {
    id: string;
    threadId: string;
    parentMessageId?: string | null;
    sender: MessageSender;
    body: string;
    tagIds: string[];
    attachmentIds?: string[];
    suggestionId?: string | null;
  }): Promise<Message> {
    const attachmentIds = _.uniq(input.attachmentIds ?? []);
    const [row] = await this.txHost.tx
      .insert(messages)
      .values({
        id: input.id,
        threadId: input.threadId,
        parentMessageId: input.parentMessageId ?? null,
        senderUserId: input.sender.kind === "user" ? input.sender.userId : null,
        senderGuestId:
          input.sender.kind === "guest" ? input.sender.guestId : null,
        suggestionId: input.suggestionId ?? null,
        body: input.body,
      })
      .returning();

    if (input.tagIds.length > 0) {
      await this.txHost.tx
        .insert(messageTags)
        .values(input.tagIds.map((tagId) => ({ messageId: row.id, tagId })));
    }

    if (attachmentIds.length > 0) {
      await this.txHost.tx.insert(messageAttachments).values(
        attachmentIds.map((attachmentId, position) => ({
          messageId: row.id,
          attachmentId,
          position,
        })),
      );
    }

    return this.mapMessage(row, input.tagIds, attachmentIds);
  }

  async getMessageById(messageId: string): Promise<Message | null> {
    const [row] = await this.txHost.tx
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    if (!row) return null;
    const tagIds = await this.fetchTagIdsForMessages([messageId]);
    const attachmentIds = await this.fetchAttachmentIdsForMessages([messageId]);
    return this.mapMessage(
      row,
      tagIds.get(messageId) ?? [],
      attachmentIds.get(messageId) ?? [],
    );
  }

  async replaceMessageTags(messageId: string, tagIds: string[]): Promise<void> {
    await this.txHost.tx
      .delete(messageTags)
      .where(eq(messageTags.messageId, messageId));
    if (tagIds.length > 0) {
      await this.txHost.tx
        .insert(messageTags)
        .values(tagIds.map((tagId) => ({ messageId, tagId })));
    }
  }

  async listMessages(
    threadId: string,
    options: { before?: Date; limit: number },
  ): Promise<ThreadMessageListItem[]> {
    const conditions = [
      eq(messages.threadId, threadId),
      isNull(messages.parentMessageId),
    ];
    if (options.before) conditions.push(lt(messages.createdAt, options.before));

    const rows = await this.txHost.tx
      .select({
        id: messages.id,
        threadId: messages.threadId,
        parentMessageId: messages.parentMessageId,
        senderUserId: messages.senderUserId,
        senderGuestId: messages.senderGuestId,
        suggestionId: messages.suggestionId,
        body: messages.body,
        createdAt: messages.createdAt,
        replyCount: sql<number>`(
          SELECT COUNT(*)::int FROM "messages" AS replies
          WHERE replies.parent_message_id = "messages"."id"
        )`,
      })
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(options.limit);

    const tagMap = await this.fetchTagIdsForMessages(rows.map((r) => r.id));
    const attachmentMap = await this.fetchAttachmentIdsForMessages(
      rows.map((r) => r.id),
    );
    return rows.map((r) => ({
      message: this.mapMessage(
        r,
        tagMap.get(r.id) ?? [],
        attachmentMap.get(r.id) ?? [],
      ),
      replyCount: r.replyCount,
    }));
  }

  async listReplies(
    parentMessageId: string,
    options: { before?: Date; limit: number },
  ): Promise<Message[]> {
    const conditions = [eq(messages.parentMessageId, parentMessageId)];
    if (options.before) conditions.push(lt(messages.createdAt, options.before));

    const rows = await this.txHost.tx
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(options.limit);

    const tagMap = await this.fetchTagIdsForMessages(rows.map((r) => r.id));
    const attachmentMap = await this.fetchAttachmentIdsForMessages(
      rows.map((r) => r.id),
    );
    return rows.map((r) =>
      this.mapMessage(r, tagMap.get(r.id) ?? [], attachmentMap.get(r.id) ?? []),
    );
  }

  private async fetchAttachmentIdsForMessages(
    messageIds: string[],
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (messageIds.length === 0) return result;

    const links = await this.txHost.tx
      .select({
        messageId: messageAttachments.messageId,
        attachmentId: messageAttachments.attachmentId,
        position: messageAttachments.position,
      })
      .from(messageAttachments)
      .where(inArray(messageAttachments.messageId, messageIds))
      .orderBy(messageAttachments.position);

    for (const link of links) {
      const existing = result.get(link.messageId);
      if (existing) {
        existing.push(link.attachmentId);
      } else {
        result.set(link.messageId, [link.attachmentId]);
      }
    }
    return result;
  }

  private async fetchTagIdsForMessages(
    messageIds: string[],
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (messageIds.length === 0) return result;

    const links = await this.txHost.tx
      .select({
        messageId: messageTags.messageId,
        tagId: messageTags.tagId,
      })
      .from(messageTags)
      .where(inArray(messageTags.messageId, messageIds));

    for (const link of links) {
      const existing = result.get(link.messageId);
      if (existing) {
        existing.push(link.tagId);
      } else {
        result.set(link.messageId, [link.tagId]);
      }
    }
    return result;
  }

  async listThreadsForUser(userId: string): Promise<ThreadListItem[]> {
    const myThreads = await this.txHost.tx
      .select({ threadId: threadParticipants.threadId })
      .from(threadParticipants)
      .where(eq(threadParticipants.userId, userId));
    const threadIds = myThreads.map((r) => r.threadId);
    if (threadIds.length === 0) return [];

    const rows = await this.txHost.tx.execute(sql`
      with my_threads as (
        select t.id, t.public_view_id, t.created_at
        from message_threads t
        where t.id in (${sql.join(
          threadIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
      ),
      last_msg as (
        select distinct on (m.thread_id)
          m.thread_id, m.body, m.created_at, m.sender_user_id, m.sender_guest_id
        from messages m
        where m.thread_id in (select id from my_threads)
        order by m.thread_id, m.created_at desc
      )
      select
        t.id as thread_id,
        t.public_view_id,
        t.created_at as thread_created_at,
        p.user_id as other_user_id,
        p.guest_id as other_guest_id,
        u.name as other_user_name,
        u.first_name as other_user_first_name,
        u.last_name as other_user_last_name,
        u.email as other_user_email,
        u.image as other_user_image,
        g.display_name as other_guest_display_name,
        pv.id as pv_id,
        pv.name as pv_name,
        pv.expires_at as pv_expires_at,
        pv.revoked_at as pv_revoked_at,
        un_a.removed_at as conn_a_removed_at,
        un_b.removed_at as conn_b_removed_at,
        lm.body as last_body,
        lm.created_at as last_created_at,
        lm.sender_user_id as last_sender_user_id,
        lm.sender_guest_id as last_sender_guest_id
      from my_threads t
      join thread_participants p
        on p.thread_id = t.id
       and not (p.user_id = ${userId} and p.user_id is not null)
      left join users u on u.id = p.user_id
      left join public_view_guests g on g.id = p.guest_id
      left join public_views pv on pv.id = t.public_view_id
      left join user_network un_a
        on un_a.user_id = ${userId} and un_a.connection_id = p.user_id
      left join user_network un_b
        on un_b.user_id = p.user_id and un_b.connection_id = ${userId}
      left join last_msg lm on lm.thread_id = t.id
      order by coalesce(lm.created_at, t.created_at) desc
    `);

    const data = (rows as unknown as { rows: Array<Record<string, unknown>> })
      .rows;
    return data.map((r) => this.mapThreadListItem(r));
  }

  private mapThreadListItem(r: Record<string, unknown>): ThreadListItem {
    const thread = Thread.create({
      id: r.thread_id as string,
      publicViewId: (r.public_view_id as string | null) ?? null,
      createdAt: new Date(r.thread_created_at as string),
    });

    let other: OtherParticipantView;
    if (r.other_user_id) {
      const removedA = r.conn_a_removed_at as Date | null;
      const removedB = r.conn_b_removed_at as Date | null;
      other = {
        kind: "user",
        userId: r.other_user_id as string,
        name: (r.other_user_name as string | null) ?? null,
        firstName: (r.other_user_first_name as string | null) ?? null,
        lastName: (r.other_user_last_name as string | null) ?? null,
        email: r.other_user_email as string,
        image: (r.other_user_image as string | null) ?? null,
        isActiveConnection: removedA === null && removedB === null,
      };
    } else {
      const expiresAt = new Date(r.pv_expires_at as string);
      const revokedAt = r.pv_revoked_at
        ? new Date(r.pv_revoked_at as string)
        : null;
      other = {
        kind: "guest",
        guestId: r.other_guest_id as string,
        displayName: r.other_guest_display_name as string,
        publicViewId: r.pv_id as string,
        publicViewName: (r.pv_name as string | null) ?? null,
        publicViewExpired:
          revokedAt !== null ||
          (expiresAt && expiresAt.getTime() <= Date.now()),
      };
    }

    const lastMessage = r.last_created_at
      ? {
          body: r.last_body as string,
          createdAt: new Date(r.last_created_at as string),
          senderKind: (r.last_sender_user_id ? "user" : "guest") as
            | "user"
            | "guest",
        }
      : null;

    return { thread, other, lastMessage };
  }

  private mapThread(row: ThreadRow): Thread {
    return Thread.create({
      id: row.id,
      publicViewId: row.publicViewId,
      createdAt: row.createdAt,
    });
  }

  private mapMessage(
    row: MessageRow,
    tagIds: string[] = [],
    attachmentIds: string[] = [],
  ): Message {
    const sender: MessageSender = row.senderUserId
      ? { kind: "user", userId: row.senderUserId }
      : { kind: "guest", guestId: row.senderGuestId! };
    return Message.create({
      id: row.id,
      threadId: row.threadId,
      parentMessageId: row.parentMessageId,
      sender,
      body: row.body,
      tagIds,
      attachmentIds,
      suggestionId: row.suggestionId,
      createdAt: row.createdAt,
    });
  }
}
