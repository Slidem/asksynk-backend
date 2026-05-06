import "reflect-metadata";

import { Injectable } from "@nestjs/common";

import type { EventDef } from "../event-registry/events.types";
import { DeliveryMode } from "../event-registry/events.types";
import { EVENT_CONSUMER_METADATA } from "./event-consumer.constants";
import { EventConsumerOptions } from "./event-consumer.types";

export function EventConsumer<T extends EventDef>(
  options: EventConsumerOptions<T>,
): ClassDecorator {
  return (target) => {
    validate(options);
    Reflect.defineMetadata(EVENT_CONSUMER_METADATA, options, target);
    Injectable()(target);
  };
}

function validate<T extends EventDef>(opts: EventConsumerOptions<T>): void {
  const { event, group } = opts;
  const isRealtime = event.delivery === DeliveryMode.Realtime;

  if (isRealtime) {
    if (group !== undefined) {
      throw new Error(
        `Event "${event.name}" is realtime; @EventConsumer must not declare a group.`,
      );
    }
    return;
  }

  if (!group) {
    throw new Error(
      `Event "${event.name}" is ${event.delivery}; @EventConsumer requires a "group".`,
    );
  }

  if (!event.groups.includes(group)) {
    throw new Error(
      `Group "${group}" is not declared on event "${event.name}". ` +
        `Declared groups: ${event.groups.join(", ") || "(none)"}.`,
    );
  }
}
