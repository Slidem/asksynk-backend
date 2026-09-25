import { Injectable } from "@nestjs/common";
import { ContextLogger } from "nestjs-context-logger";

import { MAX_ATTEMPTS } from "@/api/platform/events/consumer/durable-delivery.constants";
import { EventsDeadLettersRepository } from "@/api/platform/events/dead-letters/events-dead-letters.repository";
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

  constructor(
    private readonly bus: MessageBusService,
    private readonly deadLetters: EventsDeadLettersRepository,
  ) {}

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
          const attempt = job.retryCount + 1;

          // Only reachable when the terminal attempt died outside the catch
          // below (expired, or the worker was killed): never re-run the handler.
          if (job.retryCount >= MAX_ATTEMPTS) {
            const error = "attempt abandoned: expired or worker died";
            this.logger.error("durable event abandoned, dead-lettering", {
              event: eventName,
              eventId: data.eventId,
              group: groupName,
              attempt,
              error,
            });
            await this.deadLetter(groupName, data, job.retryCount, error);
            return;
          }

          try {
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
              attempt,
            };

            // TODO: Need to consider event idempotency; most likely need to apply some sort of inbox pattern to track processed event IDs.
            await handler.handler(validated, ctx);
          } catch (error) {
            const message =
              error instanceof Error
                ? (error.stack ?? error.message)
                : String(error);
            const logContext = {
              event: eventName,
              eventId: data.eventId,
              group: groupName,
              attempt,
              error: message,
            };

            if (attempt < MAX_ATTEMPTS) {
              // pg-boss retries; the key stays blocked meanwhile.
              this.logger.warn("durable event failed, retrying", logContext);
              throw error;
            }

            // Completing the job (by returning) unblocks the key.
            this.logger.error(
              "durable event failed, dead-lettering",
              logContext,
            );
            await this.deadLetter(groupName, data, attempt, message);
          }
        },
        {
          pollingIntervalSeconds: 0.5,
        },
      );
    }
  }

  private async deadLetter(
    consumerGroup: string,
    data: DurableJobData,
    attempts: number,
    error: string,
  ): Promise<void> {
    await this.deadLetters.record({
      consumerGroup,
      eventId: data.eventId,
      eventType: data.eventType,
      payload: data.payload,
      error,
      attempts,
    });
  }
}
