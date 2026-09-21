import { z } from "zod";

import {
  DeliveryMode,
  EventDef,
} from "@/api/platform/events/registry/events.types";

export function defineEvent<
  const TName extends string,
  TSchema extends z.ZodType,
>(input: {
  name: TName;
  schema: TSchema;
  delivery: DeliveryMode.Realtime;
}): EventDef<TName, TSchema> & {
  readonly delivery: DeliveryMode.Realtime;
};

export function defineEvent<
  const TName extends string,
  TSchema extends z.ZodType,
>(input: {
  name: TName;
  schema: TSchema;
  delivery: DeliveryMode.Durable;
}): EventDef<TName, TSchema> & {
  readonly delivery: DeliveryMode.Durable;
};

export function defineEvent<
  const TName extends string,
  TSchema extends z.ZodType,
>(input: {
  name: TName;
  schema: TSchema;
  delivery: DeliveryMode.Dual;
}): EventDef<TName, TSchema> & {
  readonly delivery: DeliveryMode.Dual;
};

export function defineEvent(input: {
  name: string;
  schema: z.ZodType;
  delivery: DeliveryMode;
}): EventDef {
  validateInput(input);

  return Object.freeze({
    name: input.name,
    schema: input.schema,
    delivery: input.delivery,
  }) as unknown as EventDef;
}

function validateInput(input: { name: string; delivery: DeliveryMode }): void {
  if (
    !input.name ||
    !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(input.name)
  ) {
    throw new Error(
      `Invalid event name "${input.name}". Must be dotted lowercase, e.g. "tag.created".`,
    );
  }
}
