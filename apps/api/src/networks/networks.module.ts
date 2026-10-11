import { Module } from "@nestjs/common";

import { ConnectionPolicyPort } from "@/api/networks/contract/connection-policy.port";
import { InvitesRepository } from "@/api/networks/domain/ports/invites.repository";
import { NetworkRepository } from "@/api/networks/domain/ports/network.repository";
import { UsersLookupRepository } from "@/api/networks/domain/ports/users-lookup.repository";
import { DrizzleInvitesRepository } from "@/api/networks/repositories/drizzle-invites.repository";
import { DrizzleNetworkRepository } from "@/api/networks/repositories/drizzle-network.repository";
import { DrizzleUsersLookupRepository } from "@/api/networks/repositories/drizzle-users-lookup.repository";
import { InvitesController } from "@/api/networks/rest/invites.controller";
import { NetworkController } from "@/api/networks/rest/network.controller";
import { NetworksService } from "@/api/networks/services/networks.service";
import { EmailModule } from "@/api/platform/email/email.module";

@Module({
  imports: [EmailModule],
  providers: [
    { provide: InvitesRepository, useClass: DrizzleInvitesRepository },
    { provide: NetworkRepository, useClass: DrizzleNetworkRepository },
    { provide: UsersLookupRepository, useClass: DrizzleUsersLookupRepository },
    NetworksService,
    { provide: ConnectionPolicyPort, useExisting: NetworksService },
  ],
  controllers: [InvitesController, NetworkController],
  exports: [ConnectionPolicyPort],
})
export class NetworksModule {}
