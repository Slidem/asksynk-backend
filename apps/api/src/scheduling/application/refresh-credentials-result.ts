import { CalendarIntegration } from "@/api/scheduling/domain/calendar-integration";
import { ProviderCredentials } from "@/api/scheduling/domain/ports/calendar-provider.types";

export type RefreshCredentialsResult =
  | {
      result: "success";
      integration: CalendarIntegration;
      credentials: ProviderCredentials;
    }
  | {
      result: "failure";
    };
