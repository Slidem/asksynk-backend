import { Auth, createAuth } from "./better-auth";
import { DynamicModule, Global, Module } from "@nestjs/common";

import { ConfigService } from "@nestjs/config";
import { EmailModule } from "@/shared/email/email.module";
import { EmailService } from "@/shared/email/email.service";

export const BETTER_AUTH = "BETTER_AUTH";

@Global()
@Module({})
export class BetterAuthModule {
  static forRoot(): DynamicModule {
    return {
      module: BetterAuthModule,
      imports: [EmailModule],
      providers: [
        {
          provide: BETTER_AUTH,
          useFactory: (
            config: ConfigService,
            emailService: EmailService,
          ): Auth => {
            const trustedOrigins = config
              .getOrThrow<string>("TRUSTED_ORIGINS")
              .split(",")
              .map((origin) => origin.trim())
              .filter(Boolean);
            return createAuth({
              databaseUrl: config.getOrThrow<string>("DATABASE_URL"),
              secret: config.getOrThrow<string>("AUTH_SECRET"),
              baseUrl: config.get<string>("AUTH_URL"),
              trustedOrigins,
              sendMagicLink: async ({ email, url }) => {
                await emailService.send({
                  to: email,
                  subject: "Sign in to AskSynk",
                  text: `Click this link to sign in: ${url}`,
                  html: `<p>Click <a href="${url}">here</a> to sign in to AskSynk.</p>`,
                });
              },
            });
          },
          inject: [ConfigService, EmailService],
        },
      ],
      exports: [BETTER_AUTH],
    };
  }
}
