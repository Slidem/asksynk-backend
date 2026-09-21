import {
  TaskBatchUpserted,
  TaskUpserted,
} from "@/api/platform/events/registry/events.registry";
import { ConsumerGroup } from "@/api/platform/events/registry/events.types";

// suggestion-sync: independent queue that rebroadcasts the parent suggestion
// (if any) when a materialized task changes. Must NOT share attention-items'
// queue or events would be split between the two consumers.
export const SuggestionSyncConsumerGroup: ConsumerGroup<
  typeof TaskUpserted | typeof TaskBatchUpserted
> = {
  name: "suggestion-sync",
  orderingKeyFn: (event) => `assignee:${event.assigneeUserId}`,
};
