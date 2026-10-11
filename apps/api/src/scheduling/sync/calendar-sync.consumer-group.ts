import {
  CalendarEventCreated,
  CalendarEventDeleted,
  CalendarEventUpdated,
} from "@/api/platform/events/registry/events.registry";
import { ConsumerGroup } from "@/api/platform/events/registry/events.types";

export const CalendarSyncConsumerGroup: ConsumerGroup<
  | typeof CalendarEventCreated
  | typeof CalendarEventUpdated
  | typeof CalendarEventDeleted
> = {
  name: "calendar-sync",
  orderingKeyFn: (event) => event.userId,
};
