import { Body, Controller, Get, Patch } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { ApiStandardErrors } from "@/api/platform/errors/swagger.decorator";
import { AuthUser as AuthUserType } from "@/api/platform/http/auth/auth.types";
import { AuthUser } from "@/api/platform/http/auth/auth-user.decorator";
import { UserProfileService } from "@/api/user-profile/application/user-profile.service";
import { UpdateUserProfileRequestDto } from "@/api/user-profile/presentation/rest/dto/update-user-profile.dto";
import { UserProfileResponseDto } from "@/api/user-profile/presentation/rest/responses/user-profile.response";
import { toUserProfileResponseDto } from "@/api/user-profile/presentation/rest/user-profile.mapper";

@ApiTags("User Profile")
@ApiBearerAuth("bearer")
@ApiStandardErrors()
@Controller("profile")
export class UserProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  /** Get the current user's profile */
  @Get()
  async getProfile(
    @AuthUser() user: AuthUserType,
  ): Promise<UserProfileResponseDto> {
    const profile = await this.userProfileService.getProfile(user.id);
    return toUserProfileResponseDto(profile);
  }

  /** Update the current user's profile */
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
