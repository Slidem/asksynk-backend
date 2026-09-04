import { DynamicModule, Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { Auth, createAuth } from "@/api/auth/betterAuth";
import { EmailModule } from "@/api/platform/email/email.module";
import { EmailService } from "@/api/platform/email/email.service";

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

            const whitelistSignupEmails = (
              config.get<string>("WHITELIST_SIGNUP_EMAILS") ?? ""
            )
              .split(",")
              .map((email) => email.trim())
              .filter(Boolean);

            return createAuth({
              databaseUrl: config.getOrThrow<string>("DATABASE_URL"),
              secret: config.getOrThrow<string>("AUTH_SECRET"),
              baseUrl: config.getOrThrow<string>("AUTH_URL"),
              advanced: {
                defaultCookieAttributes: {
                  sameSite: "none",
                  secure: true,
                },
              },
              trustedOrigins,
              whitelistSignupEmails,
              sendMagicLink: async ({ email, url }) => {
                await emailService.send({
                  to: email,
                  template: { type: "magic-link", url },
                });
              },

              sendVerificationEmail: async ({ email, url, userName }) => {
                await emailService.send({
                  to: email,
                  template: { type: "verify-email", url, userName },
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
