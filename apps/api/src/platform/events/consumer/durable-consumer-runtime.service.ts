import { Injectable } from "@nestjs/common";
import { ContextLogger } from "nestjs-context-logger";

import {
  DecoratedEventHandler,
  EventHandlerContext,
} from "@/api/platform/events/decorators/event-handler.types";
import { EventOf } from "@/api/platform/events/registry/events.types";
import { MessageBusService } from "@/api/platform/jobs/message-bus/message-bus.service";

interface DurableJobData {
  eventId: string;
  eventType: string;
  payload: unknown;
}

@Injectable()
export class DurableConsumerRuntime {
  private readonly logger = new ContextLogger(DurableConsumerRuntime.name);

  private readonly handlersPerGroup = new Map<
    string,
    DecoratedEventHandler[]
  >();

  constructor(private readonly bus: MessageBusService) {}

  async subscribe(eventHandler: DecoratedEventHandler): Promise<void> {
    const group = eventHandler.meta.group;
    if (!group) {
      throw new Error(
        `Event handler (${eventHandler.className}.${eventHandler.meta.propertyKey}) does not have a consumer group`,
      );
    }

    const groupHandlers = this.handlersPerGroup.get(group.name) ?? [];
    this.handlersPerGroup.set(group.name, [...groupHandlers, eventHandler]);
  }

  async start(): Promise<void> {
    for (const [groupName, handlers] of this.handlersPerGroup.entries()) {
      this.logger.info(
        `Starting durable consumer for group: ${groupName} with ${handlers.length} handlers`,
      );

      const queueName = groupName;
      const handlersPerEvent = new Map<string, DecoratedEventHandler>();

      for (const handler of handlers) {
        const eventName = handler.meta.event.name;
        if (handlersPerEvent.has(eventName)) {
          throw new Error(
            `Multiple handlers found for event: ${eventName} in group: ${groupName}`,
          );
        }
        handlersPerEvent.set(eventName, handler);
      }

      await this.bus.work<DurableJobData>(
        queueName,
        async (data, job) => {
          const eventName = data.eventType;
          const handler = handlersPerEvent.get(eventName);

          if (!handler) {
            throw new Error(
              `No handler found for event: ${eventName} in group: ${groupName}`,
            );
          }
          const validated = handler.meta.event.schema.parse(
            data.payload,
          ) as EventOf<typeof handler.meta.event>;

          const ctx: EventHandlerContext = {
            eventId: data.eventId,
            attempt: (job.retryCount ?? 0) + 1,
          };
          try {
            // TODO: Need to consider event idempotency; most likely need to apply some sort of inbox pattern to track processed event IDs.
            await handler.handler(validated, ctx);
          } catch (error) {
            this.logger.error("Error processing durable event", {
              event: eventName,
              eventId: data.eventId,
              group: groupName,
              attempt: ctx.attempt,
              error: error instanceof Error ? error.stack : String(error),
            });
            throw error;
          }
        },
        {
          pollingIntervalSeconds: 0.5,
        },
      );
    }
  }
}
