import { TimerLifecycle } from "@/api/platform/events/registry/events.registry";
import { ConsumerGroup } from "@/api/platform/events/registry/events.types";

export const TimerLogConsumerGroup: ConsumerGroup<typeof TimerLifecycle> = {
  name: "timer-log",
  orderingKeyFn: (event) => `user:${event.userId}`,
};
