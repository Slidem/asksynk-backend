import { Message } from "@/api/messaging/entities/message.entity";
import { ThreadListItem } from "@/api/messaging/repositories/messaging.repository";
import { MessageResponseDto } from "@/api/messaging/rest/responses/message.response";
import { ThreadListItemResponseDto } from "@/api/messaging/rest/responses/thread.response";

export function toMessageResponseDto(message: Message): MessageResponseDto {
  return {
    id: message.id,
    threadId: message.threadId,
    senderKind: message.sender.kind,
    senderId:
      message.sender.kind === "user"
        ? message.sender.userId
        : message.sender.guestId,
    body: message.body,
    tagIds: message.tagIds,
    createdAt: message.createdAt.toISOString(),
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
