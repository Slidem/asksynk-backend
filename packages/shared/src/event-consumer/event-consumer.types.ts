import { EventDef, EventOf } from "../event-registry/events.types";

export interface EventHandlerContext {
  eventId: string;
  attempt: number;
}

export type EventHandlerFn<T extends EventDef> = (
  payload: EventOf<T>,
  ctx: EventHandlerContext,
) => Promise<void>;

export type EventHandlerOptions = {
  group?: string;
  concurrency?: number;
};

export type EventHandlerMeta = {
  propertyKey: string;
  event: EventDef;
  options?: EventHandlerOptions;
};
