import { ConfigService } from "@nestjs/config";
import { EmailMessage } from "@/worker/email/email.types";
import { Injectable } from "@nestjs/common";
import { createTransport } from "nodemailer";

@Injectable()
export class EmailSender {
  constructor(private readonly configService: ConfigService) {}

  async send(message: EmailMessage): Promise<void> {
    const environment = this.configService.get<string>("ENVIRONMENT") ?? "dev";

    if (environment !== "dev") {
      throw new Error("email provider not configured");
    }

    const host = this.configService.get<string>("SMTP_HOST") ?? "localhost";
    const port = Number(this.configService.get<string>("SMTP_PORT") ?? 1025);

    const transporter = createTransport({ host, port, secure: false });

    await transporter.sendMail({
      from: "noreply@asksynk.local",
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
