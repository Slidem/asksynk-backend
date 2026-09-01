import z from "zod";

export enum DeliveryMode {
  /**
   * Durable events are stored and guaranteed to be delivered eventually, even if the consumer is temporarily unavailable. They are suitable for critical events that must not be lost;
   * Also, they act on a consumer group basis, meaning that each consumer group will receive each event once. This is ideal for events that trigger background processing, where you want to ensure that every event is processed, but the timing is not critical.
   */
  Durable = "durable",

  /**
   * Realtime events are delivered immediately to connected consumers, but there is no guarantee of delivery if the consumer is unavailable at the time the event is emitted.
   * They are also by design fan-out, meaning that all connected consumers will receive the event. This is ideal for events that trigger real-time updates in the UI (eg. WebSockets), where it's acceptable to miss some events if the user is temporarily disconnected.
   */
  Realtime = "realtime",

  /**
   * Dual events are a combination of durable and realtime. They are delivered immediately to connected consumers, and they are also delivered to consumer groups in a durable manner. This means that if a consumer is temporarily unavailable, it will receive the event once it becomes available again. This is ideal for events that trigger real-time updates but also require durability guarantees, such as notifications that should be shown to the user as soon as possible, but must not be lost if the user is temporarily disconnected.
   * Event handling for dual events should be handled both in the realtime layer (for immediate updates) and in the durable layer (for guaranteed delivery). This allows for a seamless user experience while ensuring that critical events are not missed.
   */
  Dual = "dual",
}

export type EventDef<
  TName extends string = string,
  TSchema extends z.ZodType = z.ZodType,
> = {
  name: TName;
  schema: TSchema;
  delivery: DeliveryMode;
  groups: string[];
};

export type EventOf<T extends EventDef> = z.infer<T["schema"]>;
