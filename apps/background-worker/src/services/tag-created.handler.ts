import { ContextLogger } from "nestjs-context-logger";

import { EmailService } from "@/shared/email/email.service";
import { EventConsumer } from "@/shared/event-consumer/event-consumer.decorator";
import { EventConsumerHandler } from "@/shared/event-consumer/event-consumer.types";
import { TagCreated } from "@/shared/event-registry/events.registry";

@EventConsumer({ event: TagCreated, group: "email" })
export class TagCreatedHandler implements EventConsumerHandler<
  typeof TagCreated
> {
  private readonly logger = new ContextLogger(TagCreatedHandler.name);

  constructor(private readonly emailService: EmailService) {}

  async handle(payload: {
    id: string;
    name: string;
    userId: string;
  }): Promise<void> {
    this.logger.info("Processing TagCreated event", { tagId: payload.id });

    try {
      await this.emailService.send({
        to: payload.userId + "@asksynk.local",
        subject: `Tag created: ${payload.name}`,
        text: `A new tag named "${payload.name}" has been created for your account.`,
      });

      this.logger.info("Tag created notification sent successfully", {
        tagId: payload.id,
        userId: payload.userId,
      });
    } catch (error) {
      this.logger.error("Failed to send tag created notification", {
        tagId: payload.id,
        userId: payload.userId,
        error,
      });
      throw error;
    }
  }
}
