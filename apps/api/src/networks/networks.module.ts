import { Module } from "@nestjs/common";

import { InvitesRepository } from "@/api/networks/repositories/invites.repository";
import { NetworkRepository } from "@/api/networks/repositories/network.repository";
import { UsersLookupRepository } from "@/api/networks/repositories/users-lookup.repository";
import { InvitesController } from "@/api/networks/rest/invites.controller";
import { NetworkController } from "@/api/networks/rest/network.controller";
import { NetworksService } from "@/api/networks/services/networks.service";
import { EmailModule } from "@/shared/email/email.module";

@Module({
  imports: [EmailModule],
  providers: [
    InvitesRepository,
    NetworkRepository,
    UsersLookupRepository,
    NetworksService,
  ],
  controllers: [InvitesController, NetworkController],
  exports: [NetworksService, UsersLookupRepository],
})
export class NetworksModule {}
