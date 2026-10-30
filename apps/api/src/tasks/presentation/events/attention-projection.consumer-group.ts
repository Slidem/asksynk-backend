import {
  TaskBatchDeleted,
  TaskBatchUpserted,
  TaskDeleted,
  TaskSuggested,
  TaskSuggestionResolved,
  TaskSuggestionUpdated,
  TaskUpserted,
} from "@/api/platform/events/registry/events.registry";
import { ConsumerGroup } from "@/api/platform/events/registry/events.types";

// Translates tasks' events into attention.source.*; keyed by the target user
// like attention's own group, so per-user order survives the hop.
export const TasksAttentionProjectionConsumerGroup: ConsumerGroup<
  | typeof TaskUpserted
  | typeof TaskDeleted
  | typeof TaskBatchUpserted
  | typeof TaskBatchDeleted
  | typeof TaskSuggested
  | typeof TaskSuggestionUpdated
  | typeof TaskSuggestionResolved
> = {
  name: "tasks-attention-projection",
  orderingKeyFn: (event) =>
    "assigneeUserId" in event
      ? `user:${event.assigneeUserId}`
      : `user:${event.suggesteeUserId}`,
};
