import {
  ThreadListItem,
  ThreadMessageListItem,
} from "@/api/messaging/domain/ports/messaging.repository";
import { Message } from "@/api/messaging/entities/message.entity";
import {
  MessageResponseDto,
  ThreadMessageResponseDto,
} from "@/api/messaging/rest/responses/message.response";
import { MessageAttachmentResponseDto } from "@/api/messaging/rest/responses/message-attachment.response";
import { ThreadListItemResponseDto } from "@/api/messaging/rest/responses/thread.response";
import { ReadableAttachment } from "@/api/storage/contract/attachment-catalog.port";

export function toMessageAttachmentResponse(
  attachment: ReadableAttachment,
): MessageAttachmentResponseDto {
  return {
    id: attachment.id,
    contentType: attachment.contentType,
    fileName: attachment.fileName,
    sizeBytes: attachment.sizeBytes,
    url: attachment.url,
    expiresAt: attachment.expiresAt ? attachment.expiresAt.toISOString() : null,
  };
}

export function toMessageResponseDto(
  message: Message,
  attachments: ReadableAttachment[],
): MessageResponseDto {
  return {
    id: message.id,
    threadId: message.threadId,
    parentMessageId: message.parentMessageId,
    senderKind: message.sender.kind,
    senderId:
      message.sender.kind === "user"
        ? message.sender.userId
        : message.sender.guestId,
    body: message.body,
    tagIds: message.tagIds,
    attachments: attachments.map(toMessageAttachmentResponse),
    suggestionId: message.suggestionId,
    ...(message.managedStatus ? { managedStatus: message.managedStatus } : {}),
    createdAt: message.createdAt.toISOString(),
  };
}

export function toThreadMessageResponseDto(
  item: ThreadMessageListItem,
  attachments: ReadableAttachment[],
): ThreadMessageResponseDto {
  return {
    ...toMessageResponseDto(item.message, attachments),
    replyCount: item.replyCount,
  };
}

export function toThreadListItemResponseDto(
  item: ThreadListItem,
): ThreadListItemResponseDto {
  const frozen =
    item.other.kind === "guest"
      ? item.other.publicViewExpired
      : !item.other.isActiveConnection;

  return {
    threadId: item.thread.id,
    publicViewId: item.thread.publicViewId,
    other: item.other,
    lastMessage: item.lastMessage
      ? {
          body: item.lastMessage.body,
          createdAt: item.lastMessage.createdAt.toISOString(),
          senderKind: item.lastMessage.senderKind,
        }
      : null,
    frozen,
    createdAt: item.thread.createdAt.toISOString(),
  };
}
