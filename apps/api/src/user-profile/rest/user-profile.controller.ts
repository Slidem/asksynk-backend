import { Body, Controller, Get, Patch } from "@nestjs/common";

import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { UpdateUserProfileRequestDto } from "@/api/user-profile/rest/dto/update-user-profile.dto";
import { UserProfileResponseDto } from "@/api/user-profile/rest/responses/user-profile.response";
import { toUserProfileResponseDto } from "@/api/user-profile/rest/user-profile.mapper";
import { UserProfileService } from "@/api/user-profile/services/user-profile.service";

@Controller("profile")
export class UserProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  @Get()
  async getProfile(
    @AuthUser() user: AuthUserType,
  ): Promise<UserProfileResponseDto> {
    const profile = await this.userProfileService.getProfile(user.id);
    return toUserProfileResponseDto(profile);
  }

  @Patch()
  async updateProfile(
    @Body() body: UpdateUserProfileRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<UserProfileResponseDto> {
    const profile = await this.userProfileService.updateProfile({
      ...body,
      userId: user.id,
    });
    return toUserProfileResponseDto(profile);
  }
}
