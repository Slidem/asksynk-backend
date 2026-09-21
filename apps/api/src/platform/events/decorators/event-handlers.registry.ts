import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { DiscoveryService, MetadataScanner } from "@nestjs/core";
import { ContextLogger } from "nestjs-context-logger";

import { EVENT_HANDLERS_METADATA } from "@/api/platform/events/decorators/event-handler.constants";
import {
  DecoratedEventHandler,
  EventHandlerFn,
  EventHandlerMeta,
} from "@/api/platform/events/decorators/event-handler.types";
import {
  ConsumerGroup,
  EventDef,
} from "@/api/platform/events/registry/events.types";
import { MessageBusService } from "@/api/platform/jobs/message-bus/message-bus.service";

@Injectable()
export class EventHandlersRegistry implements OnApplicationBootstrap {
  private readonly logger = new ContextLogger(EventHandlersRegistry.name);
  private handlers: DecoratedEventHandler[] = [];

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly busService: MessageBusService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.handlers = this.discoverHandlers();
    await this.ensureQueues();
  }

  async ensureQueues() {
    const groups = this.getAllConsumerGroups();
    this.logger.debug(
      `Ensuring queues for consumer groups: ${groups.map((g) => g.name).join(", ")}`,
    );
    await Promise.all(
      groups.map(async (group) => {
        await this.busService.ensureQueue(group.name);
      }),
    );
  }

  /**
   * Events this process can consume durably, i.e. that have a handler bound to
   * a consumer group. Realtime handlers (no group) are excluded: they don't
   * produce jobs, so dispatching on their behalf would only drop the row.
   */
  getAllConsumerGroupHandledEvents(): EventDef[] {
    const events = new Map<string, EventDef>();

    for (const { meta } of this.handlers) {
      if (meta.group) {
        events.set(meta.event.name, meta.event);
      }
    }

    return [...events.values()];
  }

  getHandlers(): readonly DecoratedEventHandler[] {
    return this.handlers;
  }

  /** Distinct consumer groups declared by handlers of the given event. */
  getConsumerGroups(eventName: string): ConsumerGroup<EventDef>[] {
    const groups = new Map<string, ConsumerGroup<EventDef>>();

    for (const { meta } of this.handlers) {
      if (meta.event.name === eventName && meta.group) {
        groups.set(meta.group.name, meta.group);
      }
    }

    return [...groups.values()];
  }

  getAllConsumerGroups(): ConsumerGroup<EventDef>[] {
    const groups = new Map<string, ConsumerGroup<EventDef>>();

    for (const { meta } of this.handlers) {
      if (!meta.group) {
        continue;
      }

      const existingGroup = groups.get(meta.group.name);

      if (existingGroup && existingGroup !== meta.group) {
        throw new Error(
          `Conflicting definitions for consumer group "${meta.group.name}". All handlers must use the same group definition (same instance).`,
        );
      }

      groups.set(meta.group.name, meta.group);
    }

    return [...groups.values()];
  }

  private discoverHandlers(): DecoratedEventHandler[] {
    const result: DecoratedEventHandler[] = [];

    const eventHandlersDecoratedHandlers = this.discovery.getProviders();

    for (const wrapper of eventHandlersDecoratedHandlers) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;

      const list = Reflect.getOwnMetadata(EVENT_HANDLERS_METADATA, metatype) as
        | EventHandlerMeta[]
        | undefined;

      if (!list || list.length === 0) {
        continue;
      }

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
