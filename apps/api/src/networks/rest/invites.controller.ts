import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";

import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { UuidV7Param } from "@/api/common/decorators/param.decorators";
import { CreateInviteRequestDto } from "@/api/networks/rest/dto/create-invite.dto";
import { toInviteResponseDto } from "@/api/networks/rest/networks.mapper";
import { InviteResponseDto } from "@/api/networks/rest/responses/invite.response";
import { NetworksService } from "@/api/networks/services/networks.service";

@Controller("invites")
export class InvitesController {
  constructor(private readonly networksService: NetworksService) {}

  @Post()
  async createInvite(
    @Body() dto: CreateInviteRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<InviteResponseDto> {
    const invite = await this.networksService.createInvite(user.id, dto.email);
    return toInviteResponseDto(invite);
  }

  @Get("sent")
  async listSent(@AuthUser() user: AuthUserType): Promise<InviteResponseDto[]> {
    const invites = await this.networksService.listSent(user.id);
    return invites.map(toInviteResponseDto);
  }

  @Get("received")
  async listReceived(
    @AuthUser() user: AuthUserType,
  ): Promise<InviteResponseDto[]> {
    const invites = await this.networksService.listReceived(user.email);
    return invites.map(toInviteResponseDto);
  }

  @Post(":id/accept")
  @HttpCode(200)
  async accept(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<InviteResponseDto> {
    const invite = await this.networksService.acceptInvite(id, {
      id: user.id,
      email: user.email,
    });
    return toInviteResponseDto(invite);
  }

  @Post(":id/reject")
  @HttpCode(200)
  async reject(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<InviteResponseDto> {
    const invite = await this.networksService.rejectInvite(id, {
      email: user.email,
    });
    return toInviteResponseDto(invite);
  }
}
