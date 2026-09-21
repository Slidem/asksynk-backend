import { TimerLifecycle } from "@/api/platform/events/registry/events.registry";
import { ConsumerGroup } from "@/api/platform/events/registry/events.types";

export const TimerEventLogConsumerGroup: ConsumerGroup<typeof TimerLifecycle> =
  {
    name: "timer-event-log",
    orderingKeyFn: (event) => `user:${event.userId}`,
  };
