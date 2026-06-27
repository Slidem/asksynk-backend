import { Controller, Delete, Get, HttpCode, Param } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { ApiStandardErrors } from "@/api/common/errors/api-error-responses.decorator";
import { toNetworkConnectionResponseDto } from "@/api/networks/rest/networks.mapper";
import { NetworkConnectionResponseDto } from "@/api/networks/rest/responses/network-connection.response";
import { NetworksService } from "@/api/networks/services/networks.service";

@ApiTags("Network")
@ApiBearerAuth("bearer")
@ApiStandardErrors()
@Controller("network")
export class NetworkController {
  constructor(private readonly networksService: NetworksService) {}

  /** List the current user's network connections */
  @Get()
  async list(
    @AuthUser() user: AuthUserType,
  ): Promise<NetworkConnectionResponseDto[]> {
    const connections = await this.networksService.listConnections(user.id);
    return connections.map(toNetworkConnectionResponseDto);
  }

  /** Remove a connection from the current user's network */
  @Delete(":connectionId")
  @HttpCode(204)
  async remove(
    @Param("connectionId") connectionId: string,
    @AuthUser() user: AuthUserType,
  ): Promise<void> {
    await this.networksService.removeConnection(user.id, connectionId);
  }
}
