import { ConfigService } from "@nestjs/config/dist/config.service";
import { AgentMailClient } from "agentmail";

import { RawEmailMessage } from "@/api/platform/email/email.types";
import { EmailProvider } from "@/api/platform/email/providers/email.provider";

export class AgentEmailProvider extends EmailProvider {
  private readonly client: AgentMailClient;
  private readonly inboxId: string;

  constructor(private readonly configService: ConfigService) {
    super();
    const apiKey = this.configService.getOrThrow<string>("AGENTMAIL_API_KEY");
    this.inboxId = this.configService.getOrThrow<string>("AGENTMAIL_INBOX_ID");
    this.client = new AgentMailClient({ apiKey });
  }

  async sendEmail(message: RawEmailMessage): Promise<void> {
    await this.client.inboxes.messages.send(this.inboxId, {
      to: message.to,
      subject: message.subject ?? "",
      //   text: message.text,
      html: message.html,
    });
  }
}
