import { Module } from "@nestjs/common";

import { MessagingRepository } from "@/api/messaging/repositories/messaging.repository";
import { GuestMessagingController } from "@/api/messaging/rest/guest-messaging.controller";
import { ThreadsController } from "@/api/messaging/rest/threads.controller";
import { MessagingService } from "@/api/messaging/services/messaging.service";
import { NetworksModule } from "@/api/networks/networks.module";
import { PublicViewsModule } from "@/api/public-views/public-views.module";
import { EventsPublisherModule } from "@/shared/event-publisher/events-publisher.module";

@Module({
  imports: [NetworksModule, PublicViewsModule, EventsPublisherModule],
  providers: [MessagingRepository, MessagingService],
  controllers: [ThreadsController, GuestMessagingController],
  exports: [MessagingService, MessagingRepository],
})
export class MessagingModule {}
