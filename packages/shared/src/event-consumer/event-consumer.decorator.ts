import "reflect-metadata";

import type { EventDef } from "../event-registry/events.types";
import { DeliveryMode } from "../event-registry/events.types";
import { EVENT_HANDLERS_METADATA } from "./event-consumer.constants";
import {
  EventHandlerFn,
  EventHandlerMeta,
  EventHandlerOptions,
} from "./event-consumer.types";

export function EventHandler<T extends EventDef>(
  event: T,
  options?: EventHandlerOptions,
): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    validate(event, options?.group);

    const ctor = target.constructor;
    const list: EventHandlerMeta[] =
      Reflect.getOwnMetadata(EVENT_HANDLERS_METADATA, ctor) ?? [];
    list.push({
      propertyKey: propertyKey as string,
      event,
      options,
    });
    Reflect.defineMetadata(EVENT_HANDLERS_METADATA, list, ctor);

    return descriptor;
  };
}

export type { EventHandlerFn };

function validate<T extends EventDef>(
  event: T,
  group: string | undefined,
): void {
  const isRealtime = event.delivery === DeliveryMode.Realtime;

  if (isRealtime) {
    if (group !== undefined) {
      throw new Error(
        `Event "${event.name}" is realtime; @EventHandler must not declare a group.`,
      );
    }
    return;
  }

  if (group && !event.groups.includes(group)) {
    throw new Error(
      `Group "${group}" is not declared on event "${event.name}". ` +
        `Declared groups: ${event.groups.join(", ") || "(none)"}.`,
    );
  }
}
