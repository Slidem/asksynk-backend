import { Body, Controller, Delete, Get, HttpCode, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { UuidV7Param } from "@/api/platform/decorators/paramValidators.decorators";
import { ApiStandardErrors } from "@/api/platform/errors/swagger.decorator";
import { AuthUser as AuthUserType } from "@/api/platform/http/auth/auth.types";
import { AuthUser } from "@/api/platform/http/auth/auth-user.decorator";
import { PublicViewsService } from "@/api/sharing/application/public-views.service";
import { CreatePublicViewRequestDto } from "@/api/sharing/presentation/rest/dto/create-public-view.dto";
import {
  toGuestResponseDto,
  toPublicViewResponseDto,
} from "@/api/sharing/presentation/rest/public-views.mapper";
import { PublicViewGuestResponseDto } from "@/api/sharing/presentation/rest/responses/guest.response";
import { PublicViewResponseDto } from "@/api/sharing/presentation/rest/responses/public-view.response";

@ApiTags("Public Views")
@ApiBearerAuth("bearer")
@ApiStandardErrors()
@Controller("public-views")
export class PublicViewsController {
  constructor(private readonly publicViewsService: PublicViewsService) {}

  /** Create a public readonly view link for the current user's schedule */
  @Post()
  async create(
    @Body() dto: CreatePublicViewRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<PublicViewResponseDto> {
    const { view, url } = await this.publicViewsService.create(user.id, {
      name: dto.name ?? null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    });
    return toPublicViewResponseDto({ view, url });
  }

  /** List the current user's public views */
  @Get()
  async list(@AuthUser() user: AuthUserType): Promise<PublicViewResponseDto[]> {
    const rows = await this.publicViewsService.listForOwner(user.id);
    return rows.map((r) =>
      toPublicViewResponseDto({
        view: r.view,
        url: r.url,
        guestCount: r.guestCount,
      }),
    );
  }

  /** List guests who have signed into a public view */
  @Get(":id/guests")
  async listGuests(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<PublicViewGuestResponseDto[]> {
    const rows = await this.publicViewsService.listGuests(user.id, id);
    return rows.map(toGuestResponseDto);
  }

  /** Revoke a public view, disabling its link */
  @Delete(":id")
  @HttpCode(204)
  async revoke(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<void> {
    await this.publicViewsService.revoke(user.id, id);
  }
}
