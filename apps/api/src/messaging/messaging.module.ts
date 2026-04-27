import { Module } from "@nestjs/common";

import { MessagingRepository } from "@/api/messaging/repositories/messaging.repository";
import { GuestMessagingController } from "@/api/messaging/rest/guest-messaging.controller";
import { ThreadsController } from "@/api/messaging/rest/threads.controller";
import { MessagingService } from "@/api/messaging/services/messaging.service";
import { NetworksModule } from "@/api/networks/networks.module";
import { PublicViewsModule } from "@/api/public-views/public-views.module";

@Module({
  imports: [NetworksModule, PublicViewsModule],
  providers: [MessagingRepository, MessagingService],
  controllers: [ThreadsController, GuestMessagingController],
  exports: [MessagingService],
})
export class MessagingModule {}
