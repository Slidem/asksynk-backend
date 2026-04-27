import { Module } from "@nestjs/common";

import { CalendarEventsModule } from "@/api/calendar-events/calendar-events.module";
import { PublicViewGuestsRepository } from "@/api/public-views/repositories/public-view-guests.repository";
import { PublicViewsRepository } from "@/api/public-views/repositories/public-views.repository";
import { PublicViewsController } from "@/api/public-views/rest/public-views.controller";
import { PublicVisitorsController } from "@/api/public-views/rest/public-visitors.controller";
import { GuestSessionsService } from "@/api/public-views/services/guest-sessions.service";
import { PublicViewsService } from "@/api/public-views/services/public-views.service";

@Module({
  imports: [CalendarEventsModule],
  providers: [
    PublicViewsRepository,
    PublicViewGuestsRepository,
    PublicViewsService,
    GuestSessionsService,
  ],
  controllers: [PublicViewsController, PublicVisitorsController],
  exports: [
    PublicViewsRepository,
    PublicViewGuestsRepository,
    PublicViewsService,
  ],
})
export class PublicViewsModule {}
