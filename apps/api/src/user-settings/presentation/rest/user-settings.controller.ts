import { Body, Controller, Get, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { ApiStandardErrors } from "@/api/platform/errors/swagger.decorator";
import { AuthUser as AuthUserType } from "@/api/platform/http/auth/auth.types";
import { AuthUser } from "@/api/platform/http/auth/auth-user.decorator";
import { UserSettingsService } from "@/api/user-settings/application/user-settings.service";
import { UpdateUserSettingsDto } from "@/api/user-settings/presentation/rest/dto/update-user-settings.dto";
import { UserSettingsResponse } from "@/api/user-settings/presentation/rest/responses/user-settings.response";
import { toUserSettingsResponse } from "@/api/user-settings/presentation/rest/user-settings.mapper";

@ApiTags("User Settings")
@ApiBearerAuth("bearer")
@ApiStandardErrors()
@Controller("user-settings")
export class UserSettingsController {
  constructor(private readonly userSettingsService: UserSettingsService) {}

  /** Get the current user's settings */
  @Get()
  async get(@AuthUser() user: AuthUserType): Promise<UserSettingsResponse> {
    const settings = await this.userSettingsService.getSettings(user.id);
    return toUserSettingsResponse(settings);
  }

  /** Update the current user's settings */
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
