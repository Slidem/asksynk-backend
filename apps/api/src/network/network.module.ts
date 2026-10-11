import { Module } from "@nestjs/common";

import { NetworksService } from "@/api/network/application/networks.service";
import { ConnectionPolicyPort } from "@/api/network/contract/connection-policy.port";
import { InvitesRepository } from "@/api/network/domain/ports/invites.repository";
import { NetworkRepository } from "@/api/network/domain/ports/network.repository";
import { UsersLookupRepository } from "@/api/network/domain/ports/users-lookup.repository";
import { DrizzleInvitesRepository } from "@/api/network/infrastructure/persistence/drizzle-invites.repository";
import { DrizzleNetworkRepository } from "@/api/network/infrastructure/persistence/drizzle-network.repository";
import { DrizzleUsersLookupRepository } from "@/api/network/infrastructure/persistence/drizzle-users-lookup.repository";
import { InvitesController } from "@/api/network/presentation/rest/invites.controller";
import { NetworkController } from "@/api/network/presentation/rest/network.controller";
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
export class NetworkModule {}
