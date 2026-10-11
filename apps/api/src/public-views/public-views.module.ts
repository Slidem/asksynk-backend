import { Module } from "@nestjs/common";

import { GuestIdentityModule } from "@/api/auth/guest-identity.module";
import { PublicLinkPort } from "@/api/public-views/contract/public-link.port";
import { PublicViewGuestsRepository } from "@/api/public-views/domain/ports/public-view-guests.repository";
import { PublicViewsRepository } from "@/api/public-views/domain/ports/public-views.repository";
import { GuestMessageCountHandler } from "@/api/public-views/handlers/guest-message-count.handler";
import { DrizzlePublicViewGuestsRepository } from "@/api/public-views/repositories/drizzle-public-view-guests.repository";
import { DrizzlePublicViewsRepository } from "@/api/public-views/repositories/drizzle-public-views.repository";
import { PublicViewsController } from "@/api/public-views/rest/public-views.controller";
import { PublicVisitorsController } from "@/api/public-views/rest/public-visitors.controller";
import { GuestSessionsService } from "@/api/public-views/services/guest-sessions.service";
import { PublicLinkService } from "@/api/public-views/services/public-link.service";
import { PublicViewGuestIdentityProvider } from "@/api/public-views/services/public-view-guest-identity.provider";
import { PublicViewsService } from "@/api/public-views/services/public-views.service";

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
export class PublicViewsModule {}
