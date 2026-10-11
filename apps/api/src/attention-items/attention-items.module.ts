import { Module } from "@nestjs/common";

import { AttentionDueDateService } from "@/api/attention-items/attention-due-date.service";
import { AttentionItemsService } from "@/api/attention-items/attention-items.service";
import { AttentionItemsRepository } from "@/api/attention-items/domain/ports/attention-items.repository";
import { DrizzleAttentionItemsRepository } from "@/api/attention-items/drizzle-attention-items.repository";
import { MessageAttentionHandler } from "@/api/attention-items/handlers/message-attention.handler";
import { TagCalendarAttentionHandler } from "@/api/attention-items/handlers/tag-calendar-attention.handler";
import { TaskAttentionHandler } from "@/api/attention-items/handlers/task-attention.handler";
import { AttentionItemsController } from "@/api/attention-items/rest/attention-items.controller";
import { EventsPublisherModule } from "@/api/platform/events/publisher/events-publisher.module";
import { SchedulingModule } from "@/api/scheduling/scheduling.module";
import { TaggingModule } from "@/api/tagging/tagging.module";

@Module({
  imports: [EventsPublisherModule, SchedulingModule, TaggingModule],
  providers: [
    { provide: AttentionItemsRepository, useClass: DrizzleAttentionItemsRepository },
    AttentionItemsService,
    AttentionDueDateService,
    MessageAttentionHandler,
    TaskAttentionHandler,
    TagCalendarAttentionHandler,
  ],
  controllers: [AttentionItemsController],
})
export class AttentionItemsModule {}
