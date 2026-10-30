import {
  AttentionSourceRemoved,
  AttentionSourceUpserted,
  MessageCreated,
  MessageManagedStatusChanged,
  MessageUpdated,
} from "@/api/platform/events/registry/events.registry";
import { EventOf } from "@/api/platform/events/registry/events.types";

// Conversations' outbound ACL onto attention's ingestion contract. Pure: one
// message event for one recipient becomes an upsert, a removal, or nothing.

type Upserted = EventOf<typeof AttentionSourceUpserted>;
type Removed = EventOf<typeof AttentionSourceRemoved>;
export type AttentionProjection =
  | { kind: "upserted"; payload: Upserted }
  | { kind: "removed"; payload: Removed };

type MessageSnapshot = EventOf<typeof MessageManagedStatusChanged>["message"];

const TITLE_MAX = 120;

/** Tagged → upsert for a non-sender user recipient; untagged → removal on an
 *  update, nothing on a create. Guests never get items. */
export function fromMessageEvent(
  p: EventOf<typeof MessageCreated> | EventOf<typeof MessageUpdated>,
  isUpdate: boolean,
): AttentionProjection | null {
  const { message, sentToUserId } = p;
  // tagIds absent = the event says nothing about tags.
  if (message.tagIds === undefined) {
    return null;
  }

  if (!sentToUserId || sentToUserId === message.senderId) {
    return null;
  }

  if (message.tagIds.length === 0) {
    return isUpdate
      ? {
          kind: "removed",
          payload: { userId: sentToUserId, source: messageSource(message.id) },
        }
      : null;
  }
  return { kind: "upserted", payload: toUpserted(sentToUserId, message) };
}

/** Only the recipient changes a managed message's status; they are the target. */
export function fromMessageStatusChanged(
  p: EventOf<typeof MessageManagedStatusChanged>,
): Upserted | null {
  if (!p.message.tagIds?.length || p.userId === p.message.senderId) return null;
  return toUpserted(p.userId, {
    ...p.message,
    managedStatus: p.managedStatus,
  });
}

function messageSource(messageId: string): Upserted["source"] {
  return { context: "conversations", kind: "message", id: messageId };
}

function toUpserted(
  userId: string,
  message: Omit<MessageSnapshot, "parentMessageId"> & {
    tagIds?: string[];
  },
): Upserted {
  return {
    userId,
    source: messageSource(message.id),
    preview: {
      title: message.body.slice(0, TITLE_MAX),
      body: message.body,
      actor: { kind: message.senderKind, id: message.senderId },
      meta: { threadId: message.threadId },
    },
    tagIds: message.tagIds ?? [],
    status: message.managedStatus?.status ?? "created",
    dueDate: null,
    occurredAt: message.createdAt,
  };
}
