import { Controller, Delete, Get, HttpCode, Param } from "@nestjs/common";

import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { toNetworkConnectionResponseDto } from "@/api/networks/rest/networks.mapper";
import { NetworkConnectionResponseDto } from "@/api/networks/rest/responses/network-connection.response";
import { NetworksService } from "@/api/networks/services/networks.service";

@Controller("network")
export class NetworkController {
  constructor(private readonly networksService: NetworksService) {}

  @Get()
  async list(
    @AuthUser() user: AuthUserType,
  ): Promise<NetworkConnectionResponseDto[]> {
    const connections = await this.networksService.listConnections(user.id);
    return connections.map(toNetworkConnectionResponseDto);
  }

  @Delete(":connectionId")
  @HttpCode(204)
  async remove(
    @Param("connectionId") connectionId: string,
    @AuthUser() user: AuthUserType,
  ): Promise<void> {
    await this.networksService.removeConnection(user.id, connectionId);
  }
}
