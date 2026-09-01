import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { renderTemplate } from "./email.templates";
import { EmailMessage, RawEmailMessage } from "./email.types";
import { EmailProvider } from "./providers/email.provider";

@Injectable()
export class EmailService {
  constructor(
    private readonly configService: ConfigService,
    private readonly emailProvider: EmailProvider,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    let raw: RawEmailMessage;

    if ("template" in message) {
      const appUrl = this.configService.get<string>("APP_BASE_URL");
      const rendered = renderTemplate(message.template, appUrl);
      raw = {
        to: message.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      };
    } else {
      raw = {
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      };
    }

    await this.emailProvider.sendEmail(raw);
  }
}
