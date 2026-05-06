import { Injectable } from "@nestjs/common";
import { ContextLogger } from "nestjs-context-logger";

import { EmailService } from "@/shared/email/email.service";
import { EventHandler } from "@/shared/event-consumer/event-consumer.decorator";
import {
  TagCreated,
  TagUpdated,
} from "@/shared/event-registry/events.registry";
import { EventOf } from "@/shared/event-registry/events.types";

@Injectable()
export class TagNotificationsService {
  private readonly logger = new ContextLogger(TagNotificationsService.name);

  constructor(private readonly emailService: EmailService) {}

  @EventHandler(TagCreated, { group: "email" })
  async onTagCreated(payload: EventOf<typeof TagCreated>): Promise<void> {
    this.logger.info("Processing TagCreated event", { tagId: payload.id });
    await this.emailService.send({
      to: payload.userId + "@asksynk.local",
      subject: `Tag created: ${payload.name}`,
      text: `A new tag named "${payload.name}" has been created for your account.`,
    });
  }

  @EventHandler(TagUpdated, { group: "email" })
  async onTagUpdated(payload: EventOf<typeof TagUpdated>): Promise<void> {
    this.logger.info("Processing TagUpdated event", { tagId: payload.id });
    await this.emailService.send({
      to: payload.userId + "@asksynk.local",
      subject: `Tag updated: ${payload.name}`,
      text: `Your tag has been updated to "${payload.name}".`,
    });
  }
}
