import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { JSONCodec, NatsConnection, connect } from "nats";
import { TagEventPayload, TagEventSubject } from "@/shared/events";

import { ConfigService } from "@nestjs/config";
import { ContextLogger } from "nestjs-context-logger";

@Injectable()
export class NatsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new ContextLogger(NatsService.name);

  private connection: NatsConnection | null = null;
  private readonly jsonCodec = JSONCodec<TagEventPayload>();

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const servers = this.configService.getOrThrow<string>("NATS_URL");
    this.connection = await connect({ servers });
    this.logger.info("NATS connected", { servers });
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.connection) {
      return;
    }

    await this.connection.drain();
    this.connection = null;
  }

  publishTagEvent(subject: TagEventSubject, payload: TagEventPayload): void {
    if (!this.connection) {
      this.logger.warn("NATS not connected, skipping publish", { subject });
      return;
    }

    this.connection.publish(subject, this.jsonCodec.encode(payload));
  }
}
