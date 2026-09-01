import { ConfigService } from "@nestjs/config";
import { createTransport } from "nodemailer";

import { RawEmailMessage } from "../email.types";
import { EmailProvider } from "./email.provider";

export class LocalEmailProvider extends EmailProvider {
  private readonly host: string;
  private readonly port: number;

  constructor(private readonly configService: ConfigService) {
    super();
    this.host =
      this.configService.get<string>("MAILPIT_SMTP_HOST") ?? "localhost";

    this.port = Number(
      this.configService.get<string>("MAILPIT_SMTP_PORT") ?? 1025,
    );
  }

  async sendEmail(message: RawEmailMessage): Promise<void> {
    const transporter = createTransport({
      host: this.host,
      port: this.port,
      secure: false,
    });

    await transporter.sendMail({
      from: "noreply@asksynk.local",
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
