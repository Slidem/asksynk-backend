import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, isNull } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ContextLogger } from "nestjs-context-logger";
import { Client } from "pg";

import { eventsOutbox } from "@/migrations/schema/outbox";

import type { EventDef } from "../event-registry/events.types";
import {
  EventHandlerContext,
  EventHandlerFn,
} from "./event-consumer.types";

const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 15_000;

export const EVENTS_CONSUMER_DB = "EVENTS_CONSUMER_DB";

export type EventsConsumerDb = NodePgDatabase<{
  eventsOutbox: typeof eventsOutbox;
}>;

interface Subscription {
  event: EventDef;
  handler: EventHandlerFn<EventDef>;
}

@Injectable()
export class RealtimeListenerService implements OnModuleDestroy {
  private readonly logger = new ContextLogger(RealtimeListenerService.name);

  private client: Client | null = null;
  private readonly subscriptions = new Map<string, Subscription[]>();
  private stopped = false;
  private started = false;
  private reconnectAttempts = 0;
  private reconnectHandle: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    @Inject(EVENTS_CONSUMER_DB) private readonly db: EventsConsumerDb,
  ) {}

  subscribe<T extends EventDef>(
    event: T,
    handler: EventHandlerFn<T>,
  ): void {
    if (this.started) {
      throw new Error(
        "RealtimeListenerService.subscribe called after start(). " +
          "All @EventHandler realtime methods must be discovered before bootstrap completes.",
      );
    }
    const channel = this.channelFor(event);
    const list = this.subscriptions.get(channel) ?? [];
    list.push({
      event,
      handler: handler as EventHandlerFn<EventDef>,
    });
    this.subscriptions.set(channel, list);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    if (this.subscriptions.size === 0) {
      this.logger.info("no realtime subscriptions; skipping listener");
      return;
    }
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.reconnectHandle) clearTimeout(this.reconnectHandle);
    if (this.client) {
      try {
        await this.client.end();
      } catch (error) {
        this.logger.warn("error closing realtime listener", { error });
      }
      this.client = null;
    }
  }

  private channelFor(event: EventDef): string {
    return `evt:${event.name}`;
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;

    const connectionString = this.config.getOrThrow<string>("DATABASE_URL");
    const client = new Client({ connectionString });

    client.on("notification", (msg) => {
      void this.dispatch(msg.channel, msg.payload);
    });
    client.on("error", (error) => {
      this.logger.error("realtime listener error", { error });
      this.scheduleReconnect();
    });
    client.on("end", () => {
      if (!this.stopped) this.scheduleReconnect();
    });

    try {
      await client.connect();
      for (const channel of this.subscriptions.keys()) {
        await client.query(`LISTEN "${channel}"`);
      }
      this.client = client;
      this.reconnectAttempts = 0;
      this.logger.info("realtime listener connected", {
        channels: [...this.subscriptions.keys()],
      });
    } catch (error) {
      this.logger.error("realtime listener connect failed", { error });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;

    if (this.client) {
      this.client.removeAllListeners();
      void this.client.end().catch(() => undefined);
      this.client = null;
    }

    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts,
      RECONNECT_MAX_DELAY_MS,
    );
    this.reconnectAttempts += 1;
    this.reconnectHandle = setTimeout(() => {
      this.reconnectHandle = null;
      void this.connect();
    }, delay);
  }

  private async dispatch(
    channel: string,
    payloadRaw: string | undefined,
  ): Promise<void> {
    const subs = this.subscriptions.get(channel);
    if (!subs || subs.length === 0) return;

    const eventId = payloadRaw?.trim();
    if (!eventId) {
      this.logger.error("realtime notify missing event id", { channel });
      return;
    }

    const [row] = await this.db
      .select({ payload: eventsOutbox.payload })
      .from(eventsOutbox)
      .where(
        and(eq(eventsOutbox.id, eventId), isNull(eventsOutbox.failedAt)),
      )
      .limit(1);

    if (!row) {
      this.logger.error("realtime notify row not found", {
        channel,
        eventId,
      });
      return;
    }

    const event = subs[0].event;
    const validated = event.schema.safeParse(row.payload);
    if (!validated.success) {
      this.logger.error("realtime payload failed schema validation", {
        channel,
        eventId,
        issues: validated.error.issues,
      });
      return;
    }

    const ctx: EventHandlerContext = {
      eventId,
      attempt: 1,
    };

    await Promise.allSettled(
      subs.map(({ event: e, handler }) =>
        handler(validated.data, ctx).catch((error: unknown) => {
          this.logger.error("realtime handler threw", {
            event: e.name,
            eventId,
            error,
          });
        }),
      ),
    );
  }
}
