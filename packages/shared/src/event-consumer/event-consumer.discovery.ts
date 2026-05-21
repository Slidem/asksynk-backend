import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { DiscoveryService, MetadataScanner } from "@nestjs/core";
import { ContextLogger } from "nestjs-context-logger";

import type { EventDef } from "../event-registry/events.types";
import { DeliveryMode } from "../event-registry/events.types";
import { DurableConsumerRuntime } from "./durable-consumer-runtime.service";
import { EVENT_HANDLERS_METADATA } from "./event-consumer.constants";
import { EventHandlerFn, EventHandlerMeta } from "./event-consumer.types";
import { RealtimeListenerService } from "./realtime-listener.service";

interface DiscoveredHandler {
  className: string;
  meta: EventHandlerMeta;
  handler: EventHandlerFn<EventDef>;
}

@Injectable()
export class EventConsumerDiscovery implements OnApplicationBootstrap {
  private readonly logger = new ContextLogger(EventConsumerDiscovery.name);

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly realtime: RealtimeListenerService,
    private readonly durable: DurableConsumerRuntime,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const handlers = this.discoverHandlers();

    let realtimeCount = 0;
    let durableCount = 0;

    for (const h of handlers) {
      const { event, options } = h.meta;
      const delivery = event.delivery;
      const id = `${h.className}.${h.meta.propertyKey}`;

      if (
        (delivery === DeliveryMode.Realtime ||
          delivery === DeliveryMode.Dual) &&
        options?.group === undefined
      ) {
        this.realtime.subscribe(event, h.handler);
        realtimeCount += 1;
        this.logger.info("bound realtime handler", {
          event: event.name,
          handler: id,
        });
        continue;
      }

      if (
        (delivery === DeliveryMode.Durable || delivery === DeliveryMode.Dual) &&
        options?.group !== undefined
      ) {
        await this.durable.bind(
          event,
          options.group,
          h.handler,
          options.concurrency,
        );
        durableCount += 1;
        continue;
      }

      throw new Error(
        `@EventHandler ${id} has invalid options for event "${event.name}" (delivery=${delivery}).`,
      );
    }

    await this.realtime.start();

    this.logger.info("event handlers bound", {
      realtime: realtimeCount,
      durable: durableCount,
    });
  }

  private discoverHandlers(): DiscoveredHandler[] {
    const result: DiscoveredHandler[] = [];

    for (const wrapper of this.discovery.getProviders()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;

      const list = Reflect.getOwnMetadata(EVENT_HANDLERS_METADATA, metatype) as
        | EventHandlerMeta[]
        | undefined;
      if (!list || list.length === 0) continue;

      const className = metatype.name;
      const prototype = Object.getPrototypeOf(instance) as object;
      const methodNames = new Set(
        this.metadataScanner.getAllMethodNames(prototype),
      );

      for (const meta of list) {
        if (!methodNames.has(meta.propertyKey)) {
          throw new Error(
            `@EventHandler method "${meta.propertyKey}" not found on ${className}.`,
          );
        }
        const fn = (instance as Record<string, unknown>)[meta.propertyKey];
        if (typeof fn !== "function") {
          throw new Error(
            `@EventHandler target ${className}.${meta.propertyKey} is not a function.`,
          );
        }
        const bound = (fn as (...args: unknown[]) => Promise<void>).bind(
          instance,
        ) as EventHandlerFn<EventDef>;
        result.push({ className, meta, handler: bound });
      }
    }

    return result;
  }
}
