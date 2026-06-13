import { Module } from "@nestjs/common";

import { AttentionDueDateService } from "@/api/attention-items/attention-due-date.service";
import { AttentionItemsEventHandler } from "@/api/attention-items/attention-items.event-handler";
import { AttentionItemsRepository } from "@/api/attention-items/attention-items.repository";
import { AttentionItemsService } from "@/api/attention-items/attention-items.service";
import { AttentionItemsController } from "@/api/attention-items/rest/attention-items.controller";
import { TagRepository } from "@/api/tags/repositories/tags.repository";
import { EventsPublisherModule } from "@/shared/event-publisher/events-publisher.module";

@Module({
  imports: [EventsPublisherModule],
  providers: [
    AttentionItemsRepository,
    AttentionItemsService,
    AttentionItemsEventHandler,
    AttentionDueDateService,
    TagRepository,
  ],
  controllers: [AttentionItemsController],
  exports: [AttentionItemsService, AttentionDueDateService],
})
export class AttentionItemsModule {}
