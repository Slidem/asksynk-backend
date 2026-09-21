import "reflect-metadata";

import { EVENT_HANDLERS_METADATA } from "@/api/platform/events/decorators/event-handler.constants";
import {
  EventHandlerFn,
  EventHandlerMeta,
} from "@/api/platform/events/decorators/event-handler.types";
import {
  ConsumerGroup,
  DeliveryMode,
  EventDef,
} from "@/api/platform/events/registry/events.types";

export function EventHandler<T extends EventDef>(
  event: T,
  group?: ConsumerGroup<T>,
): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    validate(event, group);

    const ctor = target.constructor;
    const list: EventHandlerMeta[] =
      Reflect.getOwnMetadata(EVENT_HANDLERS_METADATA, ctor) ?? [];

    list.push({
      propertyKey: propertyKey as string,
      event,
      group,
    });

    Reflect.defineMetadata(EVENT_HANDLERS_METADATA, list, ctor);

    return descriptor;
  };
}

export type { EventHandlerFn };

function validate<T extends EventDef>(
  event: T,
  group: ConsumerGroup<T> | undefined,
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
}
