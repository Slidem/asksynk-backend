import { Injectable } from "@nestjs/common";

import { toMessageAttachmentResponse } from "@/api/conversations/presentation/rest/messaging.mapper";
import { MessageResponseDto } from "@/api/conversations/presentation/rest/responses/message.response";
import { AttachmentCatalogPort } from "@/api/files/contract/attachment-catalog.port";
import { EventHandler } from "@/api/platform/events/decorators/event-handler.decorator";
import {
  MessageCreated,
  MessageManagedStatusChanged,
  MessageUpdated,
} from "@/api/platform/events/registry/events.registry";
import { EventOf } from "@/api/platform/events/registry/events.types";
import {
  RealtimeBroadcaster,
  RealtimeTarget,
} from "@/api/platform/realtime/realtime-broadcaster";

@Injectable()
export class MessagingBroadcaster {
  constructor(
    private readonly broadcaster: RealtimeBroadcaster,
    private readonly attachmentCatalog: AttachmentCatalogPort,
  ) {}

  @EventHandler(MessageCreated)
  async onMessageCreated(
    payload: EventOf<typeof MessageCreated>,
  ): Promise<void> {
    const targets: RealtimeTarget[] = [
      { kind: "thread", id: payload.threadId },
    ];
    if (payload.sentToUserId) {
      targets.push({ kind: "user", id: payload.sentToUserId });
    }

    if (payload.sentToGuestId) {
      targets.push({ kind: "guest", id: payload.sentToGuestId });
    }

    // Resolve attachments at emit time (fresh signed urls), not at publish time — the
    // event payload is persisted in the durable outbox, so it carries only ids. Trusted:
    // everyone in these rooms is a thread participant, so all are authorized to read.
    const attachments = await this.attachmentCatalog.resolveMany(
      payload.message.attachmentIds ?? [],
    );

    const message: MessageResponseDto = {
      id: payload.message.id,
      threadId: payload.message.threadId,
      parentMessageId: payload.message.parentMessageId,
      senderKind: payload.message.senderKind,
      senderId: payload.message.senderId,
      body: payload.message.body,
      tagIds: payload.message.tagIds ?? [],
      attachments: attachments.map(toMessageAttachmentResponse),
      suggestionId: payload.message.suggestionId ?? null,
      managedStatus: payload.message.managedStatus,
      createdAt: payload.message.createdAt,
    };

    this.broadcaster.emit(targets, "message.created", {
      threadId: payload.threadId,
      message,
    });
  }

  @EventHandler(MessageUpdated)
  async onMessageUpdated(
    payload: EventOf<typeof MessageUpdated>,
  ): Promise<void> {
    this.broadcaster.emit(
      [{ kind: "thread", id: payload.threadId }],
      "message.updated",
      { threadId: payload.threadId, message: payload.message },
    );
  }

  @EventHandler(MessageManagedStatusChanged)
  async onMessageManagedStatusChanged(
    payload: EventOf<typeof MessageManagedStatusChanged>,
  ): Promise<void> {
    this.broadcaster.emit(
      [{ kind: "thread", id: payload.threadId }],
      "message.status.updated",
      {
        threadId: payload.threadId,
        messageId: payload.messageId,
        managedStatus: payload.managedStatus,
      },
    );
  }
}
