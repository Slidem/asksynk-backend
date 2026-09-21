import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { ContextLogger } from "nestjs-context-logger";

import { DurableConsumerRuntime } from "@/api/platform/events/consumer/durable-consumer-runtime.service";
import { RealtimeListenerService } from "@/api/platform/events/consumer/realtime-listener.service";
import { EventHandlersRegistry } from "@/api/platform/events/decorators/event-handlers.registry";
import { DeliveryMode } from "@/api/platform/events/registry/events.types";

@Injectable()
export class EventConsumerDiscovery implements OnApplicationBootstrap {
  private readonly logger = new ContextLogger(EventConsumerDiscovery.name);

  constructor(
    private readonly handlerRegistry: EventHandlersRegistry,
    private readonly realtime: RealtimeListenerService,
    private readonly durable: DurableConsumerRuntime,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const handlers = this.handlerRegistry.getHandlers();

    let realtimeCount = 0;
    let durableCount = 0;

    for (const h of handlers) {
      const { event, group } = h.meta;
      const delivery = event.delivery;
      const id = `${h.className}.${h.meta.propertyKey}`;

      if (
        (delivery === DeliveryMode.Realtime ||
          delivery === DeliveryMode.Dual) &&
        group === undefined
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
        group !== undefined
      ) {
        await this.durable.subscribe(h);
        durableCount += 1;
        continue;
      }

      throw new Error(
        `@EventHandler ${id} has invalid options for event "${event.name}" (delivery=${delivery}).`,
      );
    }

    await Promise.all([this.realtime.start(), this.durable.start()]);

    this.logger.info("event handlers bound", {
      realtime: realtimeCount,
      durable: durableCount,
    });
  }
}
