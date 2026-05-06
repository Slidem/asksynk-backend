import { ContextLogger } from "nestjs-context-logger";

import { EmailService } from "@/shared/email/email.service";
import { EventConsumer } from "@/shared/event-consumer/event-consumer.decorator";
import { EventConsumerHandler } from "@/shared/event-consumer/event-consumer.types";
import { TagUpdated } from "@/shared/event-registry/events.registry";

@EventConsumer({ event: TagUpdated, group: "email" })
export class TagUpdatedHandler implements EventConsumerHandler<
  typeof TagUpdated
> {
  private readonly logger = new ContextLogger(TagUpdatedHandler.name);

  constructor(private readonly emailService: EmailService) {}

  async handle(payload: {
    id: string;
    name: string;
    userId: string;
  }): Promise<void> {
    this.logger.info("Processing TagUpdated event", { tagId: payload.id });

    try {
      await this.emailService.send({
        to: payload.userId + "@asksynk.local",
        subject: `Tag updated: ${payload.name}`,
        text: `Your tag has been updated to "${payload.name}".`,
      });

      this.logger.info("Tag updated notification sent successfully", {
        tagId: payload.id,
        userId: payload.userId,
      });
    } catch (error) {
      this.logger.error("Failed to send tag updated notification", {
        tagId: payload.id,
        userId: payload.userId,
        error,
      });
      throw error;
    }
  }
}
