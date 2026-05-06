import { EventDef, EventOf } from "../event-registry/events.types";

export interface EventHandlerContext {
  eventId: string;
  attempt: number;
}

export interface EventConsumerHandler<T extends EventDef> {
  handle(payload: EventOf<T>, ctx: EventHandlerContext): Promise<void>;
}

export type EventConsumerOptions<T extends EventDef = EventDef> = {
  event: T;
  group?: string;
  concurrency?: number;
};
