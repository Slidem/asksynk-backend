import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { DiscoveryService, ModuleRef } from "@nestjs/core";
import { ContextLogger } from "nestjs-context-logger";

import type { EventDef } from "../event-registry/events.types";
import { DeliveryMode } from "../event-registry/events.types";
import { DurableConsumerRuntime } from "./durable-consumer-runtime.service";
import { EVENT_CONSUMER_METADATA } from "./event-consumer.constants";
import {
  EventConsumerHandler,
  EventConsumerOptions,
} from "./event-consumer.types";
import { RealtimeListenerService } from "./realtime-listener.service";

interface DiscoveredConsumer {
  instance: EventConsumerHandler<EventDef>;
  options: EventConsumerOptions<EventDef>;
  className: string;
}

@Injectable()
export class EventConsumerDiscovery implements OnApplicationBootstrap {
  private readonly logger = new ContextLogger(EventConsumerDiscovery.name);

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly moduleRef: ModuleRef,
    private readonly realtime: RealtimeListenerService,
    private readonly durable: DurableConsumerRuntime,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const consumers = this.discoverConsumers();

    let realtimeCount = 0;
    let durableCount = 0;

    for (const c of consumers) {
      const delivery = c.options.event.delivery;

      if (
        delivery === DeliveryMode.Realtime ||
        delivery === DeliveryMode.Dual
      ) {
        if (c.options.group === undefined) {
          this.realtime.subscribe(c.options.event, c.instance);
          realtimeCount += 1;
          continue;
        }
      }

      if (delivery === DeliveryMode.Durable || delivery === DeliveryMode.Dual) {
        if (c.options.group !== undefined) {
          await this.durable.bind(
            c.options.event,
            c.options.group,
            c.instance,
            c.options.concurrency,
          );
          durableCount += 1;
          continue;
        }
      }

      throw new Error(
        `@EventConsumer ${c.className} has invalid options for event "${c.options.event.name}" (delivery=${delivery}).`,
      );
    }

    await this.realtime.start();

    this.logger.info("event consumers bound", {
      realtime: realtimeCount,
      durable: durableCount,
    });
  }

  private discoverConsumers(): DiscoveredConsumer[] {
    const result: DiscoveredConsumer[] = [];

    for (const wrapper of this.discovery.getProviders()) {
      const metatype = wrapper.metatype;
      if (!metatype) continue;

      const options = Reflect.getMetadata(EVENT_CONSUMER_METADATA, metatype) as
        | EventConsumerOptions<EventDef>
        | undefined;
      if (!options) continue;

      const instance = this.moduleRef.get(metatype, { strict: false }) as
        | EventConsumerHandler<EventDef>
        | undefined;

      if (!instance) {
        throw new Error(
          `@EventConsumer ${metatype.name} is not registered as a provider in any imported module.`,
        );
      }

      result.push({ instance, options, className: metatype.name });
    }

    return result;
  }
}
