import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { UuidV7Param } from "@/api/common/decorators/param.decorators";
import { ApiStandardErrors } from "@/api/common/errors/api-error-responses.decorator";
import { CreateInviteRequestDto } from "@/api/networks/rest/dto/create-invite.dto";
import { toInviteResponseDto } from "@/api/networks/rest/networks.mapper";
import { InviteResponseDto } from "@/api/networks/rest/responses/invite.response";
import { NetworksService } from "@/api/networks/services/networks.service";

@ApiTags("Invites")
@ApiBearerAuth("bearer")
@ApiStandardErrors()
@Controller("invites")
export class InvitesController {
  constructor(private readonly networksService: NetworksService) {}

  /** Send a network invite to an email address */
  @Post()
  async createInvite(
    @Body() dto: CreateInviteRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<InviteResponseDto> {
    const invite = await this.networksService.createInvite(user.id, dto.email);
    return toInviteResponseDto(invite);
  }

  /** List invites the current user has sent */
  @Get("sent")
  async listSent(@AuthUser() user: AuthUserType): Promise<InviteResponseDto[]> {
    const invites = await this.networksService.listSent(user.id);
    return invites.map(toInviteResponseDto);
  }

  /** List invites the current user has received */
  @Get("received")
  async listReceived(
    @AuthUser() user: AuthUserType,
  ): Promise<InviteResponseDto[]> {
    const invites = await this.networksService.listReceived(user.email);
    return invites.map(toInviteResponseDto);
  }

  /** Accept a received invite, forming a network connection */
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

  /** Reject a received invite */
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
