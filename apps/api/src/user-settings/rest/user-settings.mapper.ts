import { UserSettings } from "@/api/user-settings/entities/user-settings.entity";
import { UserSettingsResponse } from "@/api/user-settings/rest/responses/user-settings.response";

export function toUserSettingsResponse(
  settings: UserSettings,
): UserSettingsResponse {
  return {
    attentionItemNotifications: settings.attentionItemNotifications,
    timerNotifications: settings.timerNotifications,
  };
}
