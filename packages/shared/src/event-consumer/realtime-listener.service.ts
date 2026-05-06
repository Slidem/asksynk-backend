import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ContextLogger } from "nestjs-context-logger";
import { Client } from "pg";

import type { EventDef } from "../event-registry/events.types";
import {
  EventConsumerHandler,
  EventHandlerContext,
} from "./event-consumer.types";

const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 15_000;

interface Subscription {
  event: EventDef;
  handler: EventConsumerHandler<EventDef>;
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

  constructor(private readonly config: ConfigService) {}

  subscribe<T extends EventDef>(
    event: T,
    handler: EventConsumerHandler<T>,
  ): void {
    if (this.started) {
      throw new Error(
        "RealtimeListenerService.subscribe called after start(). " +
          "All @EventConsumer realtime classes must be discovered before bootstrap completes.",
      );
    }
    const channel = this.channelFor(event);
    const list = this.subscriptions.get(channel) ?? [];
    list.push({
      event,
      handler: handler as EventConsumerHandler<EventDef>,
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

    let envelope: { id: string; payload: unknown };
    try {
      envelope = JSON.parse(payloadRaw ?? "{}");
    } catch (error) {
      this.logger.error("failed to parse realtime envelope", {
        channel,
        error,
      });
      return;
    }

    const event = subs[0].event;
    const validated = event.schema.safeParse(envelope.payload);
    if (!validated.success) {
      this.logger.error("realtime payload failed schema validation", {
        channel,
        eventId: envelope.id,
        issues: validated.error.issues,
      });
      return;
    }

    const ctx: EventHandlerContext = {
      eventId: envelope.id,
      attempt: 1,
    };

    await Promise.allSettled(
      subs.map(({ event: e, handler }) =>
        handler.handle(validated.data, ctx).catch((error) => {
          this.logger.error("realtime handler threw", {
            event: e.name,
            eventId: envelope.id,
            error,
          });
        }),
      ),
    );
  }
}
