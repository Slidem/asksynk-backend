import {
  AttentionSourceRemoved,
  AttentionSourceUpserted,
  CalendarEventCreated,
  CalendarEventDeleted,
  CalendarEventUpdated,
  TagDeleted,
  TagUpdated,
} from "@/api/platform/events/registry/events.registry";
import { ConsumerGroup } from "@/api/platform/events/registry/events.types";

// One queue for every write to a user's items, so they are serialized per user.
export const AttentionItemsConsumerGroup: ConsumerGroup<
  | typeof AttentionSourceUpserted
  | typeof AttentionSourceRemoved
  | typeof TagUpdated
  | typeof TagDeleted
  | typeof CalendarEventCreated
  | typeof CalendarEventUpdated
  | typeof CalendarEventDeleted
> = {
  name: "attention-items",
  orderingKeyFn: (event) => `user:${event.userId}`,
};
