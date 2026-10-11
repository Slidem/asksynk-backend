import {
  CalendarEventCreated,
  CalendarEventDeleted,
  CalendarEventUpdated,
  MessageCreated,
  MessageManagedStatusChanged,
  MessageUpdated,
  TagDeleted,
  TagUpdated,
  TaskBatchDeleted,
  TaskBatchUpserted,
  TaskDeleted,
  TaskSuggested,
  TaskSuggestionResolved,
  TaskSuggestionUpdated,
  TaskUpserted,
} from "@/api/platform/events/registry/events.registry";
import { ConsumerGroup } from "@/api/platform/events/registry/events.types";

export const AttentionItemsConsumerGroup: ConsumerGroup<
  | typeof TagUpdated
  | typeof TagDeleted
  | typeof MessageCreated
  | typeof MessageUpdated
  | typeof MessageManagedStatusChanged
  | typeof CalendarEventCreated
  | typeof CalendarEventUpdated
  | typeof CalendarEventDeleted
  | typeof TaskUpserted
  | typeof TaskDeleted
  | typeof TaskBatchUpserted
  | typeof TaskBatchDeleted
  | typeof TaskSuggested
  | typeof TaskSuggestionResolved
  | typeof TaskSuggestionUpdated
> = {
  name: "attention-items",
  orderingKeyFn: (event) => {
    if ("sentToUserId" in event) {
      return `user:${event.sentToUserId}`;
    }
    if ("sentToGuestId" in event) {
      return `user:${event.sentToGuestId}`;
    }
    if ("assigneeUserId" in event) {
      return `user:${event.assigneeUserId}`;
    }
    if ("suggesteeUserId" in event) {
      return `user:${event.suggesteeUserId}`;
    }
    if ("userId" in event) {
      return `user:${event.userId}`;
    }
    return "user:unknown";
  },
};
