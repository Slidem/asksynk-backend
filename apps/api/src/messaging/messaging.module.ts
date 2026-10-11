import { Module } from "@nestjs/common";

import { DrizzleMessageAttachmentRepository } from "@/api/messaging/attachments/drizzle-message-attachment.repository";
import { MessageAttachmentResolver } from "@/api/messaging/attachments/message-attachment.resolver";
import { MessageAttachmentRepository } from "@/api/messaging/domain/ports/message-attachment.repository";
import { MessagingRepository } from "@/api/messaging/domain/ports/messaging.repository";
import { AttentionMessageHandler } from "@/api/messaging/handlers/attention-message.handler";
import { DrizzleMessagingRepository } from "@/api/messaging/repositories/drizzle-messaging.repository";
import { GuestMessagingController } from "@/api/messaging/rest/guest-messaging.controller";
import { ThreadsController } from "@/api/messaging/rest/threads.controller";
import { MessagingService } from "@/api/messaging/services/messaging.service";
import { NetworksModule } from "@/api/networks/networks.module";
import { EventsPublisherModule } from "@/api/platform/events/publisher/events-publisher.module";
import { PublicViewsModule } from "@/api/public-views/public-views.module";
import { StorageModule } from "@/api/storage/storage.module";
import { TaggingModule } from "@/api/tagging/tagging.module";
import { TasksModule } from "@/api/tasks/tasks.module";

@Module({
  imports: [
    NetworksModule,
    PublicViewsModule,
    EventsPublisherModule,
    StorageModule,
    TaggingModule,
    TasksModule,
  ],
  providers: [
    { provide: MessagingRepository, useClass: DrizzleMessagingRepository },
    MessagingService,
    { provide: MessageAttachmentRepository, useClass: DrizzleMessageAttachmentRepository },
    MessageAttachmentResolver,
    AttentionMessageHandler,
  ],
  controllers: [ThreadsController, GuestMessagingController],
  exports: [MessagingService],
})
export class MessagingModule {}
