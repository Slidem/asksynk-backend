import { Injectable } from "@nestjs/common";
import { ContextLogger } from "nestjs-context-logger";

import type { EventDef, EventOf } from "../event-registry/events.types";
import { MessageBusService } from "../message-bus/message-bus.service";
import {
  EventHandlerContext,
  EventHandlerFn,
} from "./event-consumer.types";

interface DurableJobData {
  eventId: string;
  payload: unknown;
}

@Injectable()
export class DurableConsumerRuntime {
  private readonly logger = new ContextLogger(DurableConsumerRuntime.name);

  constructor(private readonly bus: MessageBusService) {}

  async bind<T extends EventDef>(
    event: T,
    group: string,
    handler: EventHandlerFn<T>,
    concurrency = 5,
  ): Promise<void> {
    const queue = `${event.name}.${group}`;

    await this.bus.work<DurableJobData>(
      queue,
      async (data, job) => {
        const validated = event.schema.parse(data.payload) as EventOf<T>;
        const ctx: EventHandlerContext = {
          eventId: data.eventId,
          attempt: (job.retryCount ?? 0) + 1,
        };
        await handler(validated, ctx);
      },
      { localConcurrency: concurrency },
    );

    this.logger.info("bound durable consumer", {
      event: event.name,
      group,
      queue,
      concurrency,
    });
  }
}
