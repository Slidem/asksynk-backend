import { MessageCreated } from "@/api/platform/events/registry/events.registry";
import { ConsumerGroup } from "@/api/platform/events/registry/events.types";

export const PublicViewsConsumerGroup: ConsumerGroup<typeof MessageCreated> = {
  name: "public-views",
  orderingKeyFn: (event) => `sender:${event.message.senderId}`,
};
