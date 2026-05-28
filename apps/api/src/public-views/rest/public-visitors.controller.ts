import { Body, Controller, Get, Param, Post } from "@nestjs/common";

import { AllowGuest } from "@/api/auth/allowGuest.decorator";
import { AuthGuest as AuthGuestType } from "@/api/auth/auth.types";
import { AuthGuest } from "@/api/auth/authGuest.decorator";
import { Public } from "@/api/auth/public.decorator";
import { GuestSignInRequestDto } from "@/api/public-views/rest/dto/guest-sign-in.dto";
import { toPublicViewMetadataResponseDto } from "@/api/public-views/rest/public-views.mapper";
import {
  GuestSessionResponseDto,
  GuestSignInResponseDto,
} from "@/api/public-views/rest/responses/guest.response";
import { PublicViewMetadataResponseDto } from "@/api/public-views/rest/responses/public-view.response";
import { GuestSessionsService } from "@/api/public-views/services/guest-sessions.service";

@Controller("public")
export class PublicVisitorsController {
  constructor(private readonly guestSessionsService: GuestSessionsService) {}

  @Public()
  @Get("views/:slug")
  async getViewMetadata(
    @Param("slug") slug: string,
  ): Promise<PublicViewMetadataResponseDto> {
    const view = await this.guestSessionsService.getViewMetadataBySlug(slug);
    return toPublicViewMetadataResponseDto(view);
  }

  @Public()
  @Post("views/:slug/sign-in")
  async signIn(
    @Param("slug") slug: string,
    @Body() dto: GuestSignInRequestDto,
  ): Promise<GuestSignInResponseDto> {
    const { guest } = await this.guestSessionsService.signIn({
      slug,
      displayName: dto.displayName,
    });
    return {
      guestId: guest.id,
      token: guest.token,
      expiresAt: guest.expiresAt.toISOString(),
      publicViewId: guest.publicViewId,
    };
  }

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
