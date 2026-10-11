import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { ApiStandardErrors } from "@/api/platform/errors/swagger.decorator";
import { AllowGuest } from "@/api/platform/http/auth/allow-guest.decorator";
import { AuthGuest as AuthGuestType } from "@/api/platform/http/auth/auth.types";
import { AuthGuest } from "@/api/platform/http/auth/auth-guest.decorator";
import { Public } from "@/api/platform/http/auth/public.decorator";
import { GuestSessionsService } from "@/api/sharing/application/guest-sessions.service";
import { GuestSignInRequestDto } from "@/api/sharing/presentation/rest/dto/guest-sign-in.dto";
import { toPublicViewMetadataResponseDto } from "@/api/sharing/presentation/rest/public-views.mapper";
import {
  GuestSessionResponseDto,
  GuestSignInResponseDto,
} from "@/api/sharing/presentation/rest/responses/guest.response";
import { PublicViewMetadataResponseDto } from "@/api/sharing/presentation/rest/responses/public-view.response";

@ApiTags("Public Visitors")
@ApiStandardErrors()
@Controller("public")
export class PublicVisitorsController {
  constructor(private readonly guestSessionsService: GuestSessionsService) {}

  /** Get public metadata for a view by its slug */
  @Public()
  @Get("views/:slug")
  async getViewMetadata(
    @Param("slug") slug: string,
  ): Promise<PublicViewMetadataResponseDto> {
    const metadata =
      await this.guestSessionsService.getViewMetadataBySlug(slug);
    return toPublicViewMetadataResponseDto(metadata);
  }

  /** Sign in as a guest to a public view by slug */
  @Public()
  @Post("views/:slug/sign-in")
  async signIn(
    @Param("slug") slug: string,
    @Body() dto: GuestSignInRequestDto,
  ): Promise<GuestSignInResponseDto> {
    const { guest, token } = await this.guestSessionsService.signIn({
      slug,
      displayName: dto.displayName,
    });
    return {
      guestId: guest.id,
      token,
      expiresAt: guest.expiresAt.toISOString(),
      publicViewId: guest.publicViewId,
    };
  }

  /** Get the current guest session */
  @AllowGuest()
  @Get("me")
  async me(
    @AuthGuest() guest: AuthGuestType,
  ): Promise<GuestSessionResponseDto> {
    return {
      guestId: guest.id,
      displayName: guest.displayName,
      publicViewId: guest.publicViewId,
      expiresAt: guest.expiresAt.toISOString(),
    };
  }
}
