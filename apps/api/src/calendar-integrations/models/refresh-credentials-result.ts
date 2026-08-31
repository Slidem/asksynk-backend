import { CalendarIntegration } from "@/api/calendar-integrations/entities/calendar-integration.entity";
import { ProviderCredentials } from "@/api/calendar-integrations/providers/types";

export type RefreshCredentialsResult =
  | {
      result: "success";
      integration: CalendarIntegration;
      credentials: ProviderCredentials;
    }
  | {
      result: "failure";
    };
