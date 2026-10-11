import { Module } from "@nestjs/common";

import { MessageAttachmentResolver } from "@/api/conversations/application/message-attachment.resolver";
import { MessagingService } from "@/api/conversations/application/messaging.service";
import { MessageAttachmentRepository } from "@/api/conversations/domain/ports/message-attachment.repository";
import { MessagingRepository } from "@/api/conversations/domain/ports/messaging.repository";
import { DrizzleMessageAttachmentRepository } from "@/api/conversations/infrastructure/persistence/drizzle-message-attachment.repository";
import { DrizzleMessagingRepository } from "@/api/conversations/infrastructure/persistence/drizzle-messaging.repository";
import { AttentionMessageHandler } from "@/api/conversations/presentation/events/attention-message.handler";
import { GuestMessagingController } from "@/api/conversations/presentation/rest/guest-messaging.controller";
import { ThreadsController } from "@/api/conversations/presentation/rest/threads.controller";
import { FilesModule } from "@/api/files/files.module";
import { NetworkModule } from "@/api/network/network.module";
import { EventsPublisherModule } from "@/api/platform/events/publisher/events-publisher.module";
import { SharingModule } from "@/api/sharing/sharing.module";
import { TaggingModule } from "@/api/tagging/tagging.module";
import { TasksModule } from "@/api/tasks/tasks.module";

@Module({
  imports: [
    NetworkModule,
    SharingModule,
    EventsPublisherModule,
    FilesModule,
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
export class ConversationsModule {}
