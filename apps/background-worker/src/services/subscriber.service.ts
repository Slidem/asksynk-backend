import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { JSONCodec, NatsConnection, connect } from "nats";
import { TagEventPayload, TagEventSubject } from "@/shared/events";

import { ConfigService } from "@nestjs/config";
import { ContextLogger } from "nestjs-context-logger";

@Injectable()
export class NatsSubscriberService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new ContextLogger(NatsSubscriberService.name);
  private connection: NatsConnection | null = null;
  private readonly jsonCodec = JSONCodec<TagEventPayload>();

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const servers = this.configService.getOrThrow<string>("NATS_URL");
    this.connection = await connect({ servers });
    this.logger.info("NATS connected", { servers });

    await this.listenForTags();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.connection) {
      return;
    }

    await this.connection.drain();
    this.connection = null;
  }

  private async listenForTags(): Promise<void> {
    if (!this.connection) {
      return;
    }

    const subjects: TagEventSubject[] = [
      TagEventSubject.Created,
      TagEventSubject.Updated,
    ];

    for (const subject of subjects) {
      const subscription = this.connection.subscribe(subject);
      (async () => {
        for await (const message of subscription) {
          const payload = this.jsonCodec.decode(message.data);
          this.logger.info("Tag event received", {
            subject: message.subject,
            id: payload.id,
            userId: payload.userId,
            name: payload.name,
          });
        }
      })();
    }
  }
}
