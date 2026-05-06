import { Injectable } from "@nestjs/common";
import { Transactional, TransactionHost } from "@nestjs-cls/transactional";
import { TransactionalAdapterDrizzleOrm } from "@nestjs-cls/transactional-adapter-drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";

import { eventsOutbox } from "@/migrations/schema/outbox";

import { EventDef, EventOf } from "../event-registry/events.types";

type OutboxSchema = { eventsOutbox: typeof eventsOutbox };

type OutboxAdapter = TransactionalAdapterDrizzleOrm<
  NodePgDatabase<OutboxSchema>
>;

export abstract class EventsPublisher {
  abstract publish<T extends EventDef>(
    def: T,
    payload: EventOf<T>,
  ): Promise<void>;
}

@Injectable()
export class EventsPublisherImpl extends EventsPublisher {
  constructor(private readonly txHost: TransactionHost<OutboxAdapter>) {
    super();
  }

  /**
   *
   * Publishes an event to the outbox. The event will be dispatched to the appropriate channels based on its delivery mode and groups.
   * A trigger on the database will be responsible for doing a pg_notify when a new event is inserted, which will send the events to all listeners in realtime.
   * A separate process will be responsible for dispatching durable events by polling the outbox table (pg boss)
   *
   * @param def
   * @param payload
   */
  @Transactional()
  async publish<T extends EventDef>(
    def: T,
    payload: EventOf<T>,
  ): Promise<void> {
    const validated = def.schema.parse(payload);
    await this.txHost.tx.insert(eventsOutbox).values({
      eventType: def.name,
      deliveryMode: def.delivery,
      groups: def.groups.join(","),
      payload: JSON.stringify(validated),
    });
  }
}
