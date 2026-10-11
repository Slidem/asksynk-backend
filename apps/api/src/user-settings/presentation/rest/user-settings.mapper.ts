import { UserSettings } from "@/api/user-settings/domain/user-settings";
import { UserSettingsResponse } from "@/api/user-settings/presentation/rest/responses/user-settings.response";

export function toUserSettingsResponse(
  settings: UserSettings,
): UserSettingsResponse {
  return {
    attentionItemNotifications: settings.attentionItemNotifications,
    timerNotifications: settings.timerNotifications,
  };
}
