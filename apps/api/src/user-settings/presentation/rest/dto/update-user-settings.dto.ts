import { IsBoolean } from "class-validator";

export class UpdateUserSettingsDto {
  @IsBoolean()
  attentionItemNotifications!: boolean;

  @IsBoolean()
  timerNotifications!: boolean;
}
