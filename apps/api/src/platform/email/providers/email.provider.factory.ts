import { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { AgentEmailProvider } from "@/api/platform/email/providers/agentemail.provider";
import { EmailProvider } from "@/api/platform/email/providers/email.provider";
import { LocalEmailProvider } from "@/api/platform/email/providers/localemail.provider";

/**
 * Binds EmailProvider to a concrete transport chosen from EMAIL_PROVIDER
 * (default: mailpit). Only the selected impl is constructed, so providers with
 * required secrets (agentmail) never instantiate unless picked.
 */
export const emailProviderFactory: Provider = {
  provide: EmailProvider,
  useFactory: (config: ConfigService) => {
    const key = config.get<string>("EMAIL_PROVIDER") ?? "mailpit";
    switch (key) {
      case "agentmail":
        return new AgentEmailProvider(config);
      case "mailpit":
      default:
        return new LocalEmailProvider(config);
    }
  },
  inject: [ConfigService],
};
