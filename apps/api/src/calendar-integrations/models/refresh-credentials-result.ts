import { CalendarIntegration } from "../entities/calendar-integration.entity";
import { ProviderCredentials } from "../providers/types";

export type RefreshCredentialsResult =
  | {
      result: "success";
      integration: CalendarIntegration;
      credentials: ProviderCredentials;
    }
  | {
      result: "failure";
    };
