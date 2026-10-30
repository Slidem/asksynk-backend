import {
  MessageCreated,
  MessageManagedStatusChanged,
  MessageUpdated,
} from "@/api/platform/events/registry/events.registry";
import { ConsumerGroup } from "@/api/platform/events/registry/events.types";

// Translates message events into attention.source.*; keyed by the target user
// like attention's own group, so per-user order survives the hop.
export const ConversationsAttentionProjectionConsumerGroup: ConsumerGroup<
  | typeof MessageCreated
  | typeof MessageUpdated
  | typeof MessageManagedStatusChanged
> = {
  name: "conversations-attention-projection",
  orderingKeyFn: (event) => {
    if ("userId" in event) return `user:${event.userId}`;
    // Guest recipients never get items; their events still need a total key.
    return event.sentToUserId
      ? `user:${event.sentToUserId}`
      : `guest:${event.sentToGuestId}`;
  },
};
