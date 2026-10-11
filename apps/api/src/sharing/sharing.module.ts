import { Module } from "@nestjs/common";

import { GuestIdentityModule } from "@/api/auth/guest-identity.module";
import { GuestSessionsService } from "@/api/sharing/application/guest-sessions.service";
import { PublicLinkService } from "@/api/sharing/application/public-link.service";
import { PublicViewGuestIdentityProvider } from "@/api/sharing/application/public-view-guest-identity.provider";
import { PublicViewsService } from "@/api/sharing/application/public-views.service";
import { PublicLinkPort } from "@/api/sharing/contract/public-link.port";
import { PublicViewGuestsRepository } from "@/api/sharing/domain/ports/public-view-guests.repository";
import { PublicViewsRepository } from "@/api/sharing/domain/ports/public-views.repository";
import { DrizzlePublicViewGuestsRepository } from "@/api/sharing/infrastructure/persistence/drizzle-public-view-guests.repository";
import { DrizzlePublicViewsRepository } from "@/api/sharing/infrastructure/persistence/drizzle-public-views.repository";
import { GuestMessageCountHandler } from "@/api/sharing/presentation/events/guest-message-count.handler";
import { PublicViewsController } from "@/api/sharing/presentation/rest/public-views.controller";
import { PublicVisitorsController } from "@/api/sharing/presentation/rest/public-visitors.controller";

@Module({
  imports: [GuestIdentityModule],
  providers: [
    { provide: PublicViewsRepository, useClass: DrizzlePublicViewsRepository },
    { provide: PublicViewGuestsRepository, useClass: DrizzlePublicViewGuestsRepository },
    PublicViewsService,
    GuestSessionsService,
    PublicViewGuestIdentityProvider,
    PublicLinkService,
    { provide: PublicLinkPort, useExisting: PublicLinkService },
    GuestMessageCountHandler,
  ],
  controllers: [PublicViewsController, PublicVisitorsController],
  exports: [PublicLinkPort],
})
export class SharingModule {}
