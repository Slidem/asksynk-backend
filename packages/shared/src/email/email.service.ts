import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport } from "nodemailer";

import { renderTemplate } from "./email.templates";
import { EmailMessage } from "./email.types";

@Injectable()
export class EmailService {
  constructor(private readonly configService: ConfigService) {}

  async send(message: EmailMessage): Promise<void> {
    const environment = this.configService.get<string>("ENVIRONMENT") ?? "dev";

    if (environment !== "dev") {
      throw new Error("Email provider not configured for production");
    }

    const host = this.configService.get<string>("SMTP_HOST") ?? "localhost";
    const port = Number(this.configService.get<string>("SMTP_PORT") ?? 1025);

    let subject: string | undefined;
    let html: string | undefined;
    let text: string | undefined;

    if ("template" in message) {
      const appUrl = this.configService.get<string>("APP_URL");
      const rendered = renderTemplate(message.template, appUrl);
      subject = rendered.subject;
      html = rendered.html;
      text = rendered.text;
    } else {
      subject = message.subject;
      html = message.html;
      text = message.text;
    }

    const transporter = createTransport({ host, port, secure: false });

    await transporter.sendMail({
      from: "noreply@asksynk.local",
      to: message.to,
      subject,
      text,
      html,
    });
  }
}
