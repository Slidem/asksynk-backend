import { Injectable, OnModuleInit } from "@nestjs/common";
import { ContextLogger } from "nestjs-context-logger";

import { EmailService } from "@/shared/email/email.service";
import {
  TAG_EVENTS_EMAIL_QUEUE,
  TagEvent,
  TagEventPayload,
} from "@/shared/events";
import { MessageBusService } from "@/shared/message-bus/message-bus.service";

@Injectable()
export class TagEventsSubscriber implements OnModuleInit {
  private readonly logger = new ContextLogger(TagEventsSubscriber.name);

  constructor(
    private readonly bus: MessageBusService,
    private readonly emailService: EmailService,
  ) {}

  async onModuleInit(): Promise<void> {
    const handler = async (payload: TagEventPayload): Promise<void> => {
      this.logger.info("Tag event received", {
        id: payload.id,
        userId: payload.userId,
        name: payload.name,
      });

      await this.emailService.send({
        to: "dev.user@asksynk.local",
        subject: `Tag event: ${payload.name}`,
        text: `Tag ${payload.name} updated for user ${payload.userId}`,
      });
    };

    await this.bus.subscribe<TagEventPayload>(
      TagEvent.Created,
      TAG_EVENTS_EMAIL_QUEUE,
      handler,
    );

    await this.bus.subscribe<TagEventPayload>(
      TagEvent.Updated,
      TAG_EVENTS_EMAIL_QUEUE,
      handler,
    );
  }
}
