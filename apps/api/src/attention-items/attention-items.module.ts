import { Module } from "@nestjs/common";

import { AttentionDueDateService } from "@/api/attention-items/attention-due-date.service";
import { AttentionItemsRepository } from "@/api/attention-items/attention-items.repository";
import { AttentionItemsService } from "@/api/attention-items/attention-items.service";
import { MessageAttentionHandler } from "@/api/attention-items/handlers/message-attention.handler";
import { TagCalendarAttentionHandler } from "@/api/attention-items/handlers/tag-calendar-attention.handler";
import { TaskAttentionHandler } from "@/api/attention-items/handlers/task-attention.handler";
import { AttentionItemsController } from "@/api/attention-items/rest/attention-items.controller";
import { TagRepository } from "@/api/tags/repositories/tags.repository";
import { EventsPublisherModule } from "@/shared/event-publisher/events-publisher.module";

@Module({
  imports: [EventsPublisherModule],
  providers: [
    AttentionItemsRepository,
    AttentionItemsService,
    AttentionDueDateService,
    TagRepository,
    MessageAttentionHandler,
    TaskAttentionHandler,
    TagCalendarAttentionHandler,
  ],
  controllers: [AttentionItemsController],
})
export class AttentionItemsModule {}
