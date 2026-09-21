import {
  ConsumerGroup,
  EventDef,
  EventOf,
} from "@/api/platform/events/registry/events.types";

export interface EventHandlerContext {
  eventId: string;
  attempt: number;
}

export type EventHandlerFn<T extends EventDef> = (
  payload: EventOf<T>,
  ctx: EventHandlerContext,
) => Promise<void>;

export type EventHandlerMeta<T extends EventDef = EventDef> = {
  propertyKey: string;
  event: EventDef;
  group?: ConsumerGroup<T>;
};

export interface DecoratedEventHandler {
  className: string;
  meta: EventHandlerMeta;
  handler: EventHandlerFn<EventDef>;
}
