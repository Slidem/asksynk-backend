import { Body, Controller, Delete, Get, HttpCode, Post } from "@nestjs/common";

import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { UuidV7Param } from "@/api/common/decorators/id.decorators";
import { CreatePublicViewRequestDto } from "@/api/public-views/rest/dto/create-public-view.dto";
import {
  toGuestResponseDto,
  toPublicViewResponseDto,
} from "@/api/public-views/rest/public-views.mapper";
import { PublicViewGuestResponseDto } from "@/api/public-views/rest/responses/guest.response";
import { PublicViewResponseDto } from "@/api/public-views/rest/responses/public-view.response";
import { PublicViewsService } from "@/api/public-views/services/public-views.service";

@Controller("public-views")
export class PublicViewsController {
  constructor(private readonly publicViewsService: PublicViewsService) {}

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

  @Get(":id/guests")
  async listGuests(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<PublicViewGuestResponseDto[]> {
    const rows = await this.publicViewsService.listGuests(user.id, id);
    return rows.map(toGuestResponseDto);
  }

  @Delete(":id")
  @HttpCode(204)
  async revoke(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<void> {
    await this.publicViewsService.revoke(user.id, id);
  }
}
