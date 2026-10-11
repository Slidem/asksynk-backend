import { CalendarIntegration } from "@/api/scheduling/entities/calendar-integration.entity";
import { ProviderCredentials } from "@/api/scheduling/providers/types";

export type RefreshCredentialsResult =
  | {
      result: "success";
      integration: CalendarIntegration;
      credentials: ProviderCredentials;
    }
  | {
      result: "failure";
    };
