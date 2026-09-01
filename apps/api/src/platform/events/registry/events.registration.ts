import { z } from "zod";

import { DeliveryMode, EventDef } from "./events.types";

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
  const TGroups extends readonly string[],
>(input: {
  name: TName;
  schema: TSchema;
  delivery: DeliveryMode.Durable;
  groups: TGroups;
}): EventDef<TName, TSchema> & {
  readonly delivery: DeliveryMode.Durable;
};

export function defineEvent<
  const TName extends string,
  TSchema extends z.ZodType,
  const TGroups extends readonly string[],
>(input: {
  name: TName;
  schema: TSchema;
  delivery: DeliveryMode.Dual;
  groups: TGroups;
}): EventDef<TName, TSchema> & {
  readonly delivery: DeliveryMode.Dual;
};

export function defineEvent(input: {
  name: string;
  schema: z.ZodType;
  delivery: DeliveryMode;
  groups?: readonly string[];
}): EventDef {
  validateInput(input);

  const allGroups = new Set(input.groups ?? []);

  return Object.freeze({
    name: input.name,
    schema: input.schema,
    delivery: input.delivery,
    groups: [...allGroups],
  }) as unknown as EventDef;
}

function validateInput(input: {
  name: string;
  delivery: DeliveryMode;
  groups?: readonly string[];
}): void {
  if (
    !input.name ||
    !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(input.name)
  ) {
    throw new Error(
      `Invalid event name "${input.name}". Must be dotted lowercase, e.g. "tag.created".`,
    );
  }

  const groups = input.groups ?? [];

  if (
    (input.delivery === DeliveryMode.Dual ||
      input.delivery === DeliveryMode.Durable) &&
    !groups.length
  ) {
    throw new Error(`Event "${input.name}" must declare at least one group.`);
  }

  if (input.delivery === DeliveryMode.Realtime && groups.length > 0) {
    throw new Error(
      `Event "${input.name}" is realtime but has groups defined; Realtime events are fan-out and should not declare groups. Use 'durable' or 'dual' delivery mode if you want to use groups.`,
    );
  }

  const dupes = (arr: readonly string[]) =>
    arr.filter((g, i) => arr.indexOf(g) !== i);

  const groupDupes = dupes(groups);
  if (groupDupes.length) {
    throw new Error(
      `Event "${input.name}" has duplicate groups: ${groupDupes.join(", ")}`,
    );
  }
}
