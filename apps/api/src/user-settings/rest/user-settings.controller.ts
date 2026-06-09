import { Body, Controller, Get, Put } from "@nestjs/common";

import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { UpdateUserSettingsDto } from "@/api/user-settings/rest/dto/update-user-settings.dto";
import { UserSettingsResponse } from "@/api/user-settings/rest/responses/user-settings.response";
import { toUserSettingsResponse } from "@/api/user-settings/rest/user-settings.mapper";
import { UserSettingsService } from "@/api/user-settings/user-settings.service";

@Controller("user-settings")
export class UserSettingsController {
  constructor(private readonly userSettingsService: UserSettingsService) {}

  @Get()
  async get(@AuthUser() user: AuthUserType): Promise<UserSettingsResponse> {
    const settings = await this.userSettingsService.getSettings(user.id);
    return toUserSettingsResponse(settings);
  }

  @Put()
  async update(
    @Body() body: UpdateUserSettingsDto,
    @AuthUser() user: AuthUserType,
  ): Promise<UserSettingsResponse> {
    const settings = await this.userSettingsService.updateSettings(user.id, {
      attentionItemNotifications: body.attentionItemNotifications,
      timerNotifications: body.timerNotifications,
    });
    return toUserSettingsResponse(settings);
  }
}
