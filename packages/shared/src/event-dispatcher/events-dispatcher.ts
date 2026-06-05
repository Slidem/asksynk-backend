import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ContextLogger } from "nestjs-context-logger";
import { Client } from "pg";

import { eventsOutbox } from "@/migrations/schema/outbox";

import { MessageBusService } from "../message-bus/message-bus.service";
import { QueuedJobInsert } from "../message-bus/message-bus.types";

export const EVENTS_DISPATCHER_DB = "EVENTS_DISPATCHER_DB";

export type EventsDispatcherDb = NodePgDatabase<{
  eventsOutbox: typeof eventsOutbox;
}>;

const LISTEN_CHANNEL = "outbox_new";
const BATCH_SIZE = 100;
const POLL_INTERVAL_MS = 1000;
const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 10000;

@Injectable()
export class EventsOutboxDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new ContextLogger(EventsOutboxDispatcher.name);

  private listenClient: Client | null = null;
  private pollHandle: NodeJS.Timeout | null = null;
  private reconnectHandle: NodeJS.Timeout | null = null;
  private stopped = false;
  private reconnectAttempts = 0;
  private ticking = false;
  private tickRequested = false;

  constructor(
    @Inject(EVENTS_DISPATCHER_DB) private readonly db: EventsDispatcherDb,
    private readonly bus: MessageBusService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.connectListen();
    this.startPollLoop();
    await this.tick();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
    }
    if (this.reconnectHandle) {
      clearTimeout(this.reconnectHandle);
    }
    if (this.listenClient) {
      try {
        await this.listenClient.end();
      } catch (error) {
        this.logger.warn("error closing dispatcher listen client", { error });
      }
      this.listenClient = null;
    }
  }

  private async connectListen(): Promise<void> {
    if (this.stopped) {
      return;
    }

    const connectionString = this.config.getOrThrow<string>("DATABASE_URL");
    const client = new Client({ connectionString });

    client.on("notification", (msg) => {
      if (msg.channel === LISTEN_CHANNEL) {
        void this.tick();
      }
    });

    client.on("error", (error) => {
      this.logger.error("dispatcher LISTEN error", { error });
      this.scheduleReconnect();
    });

    client.on("end", () => {
      if (!this.stopped) {
        this.scheduleReconnect();
      }
    });

    try {
      await client.connect();
      await client.query(`LISTEN ${LISTEN_CHANNEL}`);
      this.listenClient = client;
      this.reconnectAttempts = 0;
      this.logger.info("dispatcher LISTEN connected", {
        channel: LISTEN_CHANNEL,
      });
      void this.tick();
    } catch (error) {
      this.logger.error("dispatcher LISTEN connect failed", { error });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) {
      return;
    }

    if (this.listenClient) {
      this.listenClient.removeAllListeners();
      void this.listenClient.end().catch(() => undefined);
      this.listenClient = null;
    }

    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts,
      RECONNECT_MAX_DELAY_MS,
    );

    this.reconnectAttempts += 1;

    this.reconnectHandle = setTimeout(() => void this.connectListen(), delay);
  }

  private startPollLoop(): void {
    this.pollHandle = setInterval(
      () =>
        this.tick().catch((error) =>
          this.logger.error("poll tick failed", { error }),
        ),
      POLL_INTERVAL_MS,
    );
  }

  // Coalesces concurrent wake-ups: if a tick is already running, request a
  // re-drain so any rows that arrived mid-tick aren't missed.
  private async tick(): Promise<void> {
    if (this.stopped) {
      return;
    }

    if (this.ticking) {
      this.tickRequested = true;
      return;
    }

    this.ticking = true;

    try {
      do {
        this.tickRequested = false;
        while (await this.drainBatch()) {
          /* keep going while there's more */
        }
      } while (this.tickRequested);
    } finally {
      this.ticking = false;
    }
  }

  private async drainBatch(): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: eventsOutbox.id,
          eventType: eventsOutbox.eventType,
          groups: eventsOutbox.groups,
          payload: eventsOutbox.payload,
        })
        .from(eventsOutbox)
        .where(
          and(
            isNull(eventsOutbox.dispatchedAt),
            isNull(eventsOutbox.failedAt),
            inArray(eventsOutbox.deliveryMode, ["durable", "dual"]),
          ),
        )
        .orderBy(asc(eventsOutbox.createdAt))
        .limit(BATCH_SIZE)
        .for("update", { skipLocked: true });

      if (rows.length === 0) {
        return false;
      }

      const jobs: QueuedJobInsert[] = [];
      const succeededIds: string[] = [];
      const failed: { id: string; error: string }[] = [];

      for (const row of rows) {
        try {
          const groups = row.groups
            .split(",")
            .map((g) => g.trim())
            .filter(Boolean);

          for (const group of groups) {
            jobs.push({
              name: `${row.eventType}.${group}`,
              data: { eventId: row.id, payload: row.payload },
              singletonKey: `${row.id}.${group}`,
            });
          }
          succeededIds.push(row.id);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error("dispatcher row build failed", {
            eventId: row.id,
            error,
          });
          failed.push({ id: row.id, error: message });
        }
      }

      if (jobs.length > 0) {
        await this.bus.insertJobs(jobs);
      }

      if (succeededIds.length > 0) {
        await tx
          .update(eventsOutbox)
          .set({ dispatchedAt: sql`now()` })
          .where(inArray(eventsOutbox.id, succeededIds));
      }

      for (const f of failed) {
        await tx
          .update(eventsOutbox)
          .set({ failedAt: sql`now()`, error: f.error })
          .where(eq(eventsOutbox.id, f.id));
      }

      return rows.length === BATCH_SIZE;
    });
  }
}
