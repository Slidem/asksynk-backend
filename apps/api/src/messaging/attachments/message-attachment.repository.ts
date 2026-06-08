import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { and, eq } from "drizzle-orm";

import { TxAdapter } from "@/api/infrastructure/db/tx.module";
import {
  messageAttachments,
  messages,
  threadParticipants,
} from "@/migrations/schema/messaging";

@Injectable()
export class MessageAttachmentRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  /**
   * True if the user participates in any thread that references this attachment.
   * Single query: message_attachments → messages → thread_participants.
   */
  async userCanReachAttachment(
    attachmentId: string,
    userId: string,
  ): Promise<boolean> {
    const [row] = await this.txHost.tx
      .select({ attachmentId: messageAttachments.attachmentId })
      .from(messageAttachments)
      .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
      .innerJoin(
        threadParticipants,
        eq(threadParticipants.threadId, messages.threadId),
      )
      .where(
        and(
          eq(messageAttachments.attachmentId, attachmentId),
          eq(threadParticipants.userId, userId),
        ),
      )
      .limit(1);

    return !!row;
  }
}
