import { AttentionMessageStatusChanged } from "@/api/platform/events/registry/events.registry";
import { ConsumerGroup } from "@/api/platform/events/registry/events.types";

export const MessagingConsumerGroup: ConsumerGroup<
  typeof AttentionMessageStatusChanged
> = {
  name: "messaging",
  orderingKeyFn: (event) => event.messageId,
};
