import { Module } from "@nestjs/common";

import { AttentionDueDateService } from "@/api/attention/application/attention-due-date.service";
import { AttentionItemsService } from "@/api/attention/application/attention-items.service";
import { AttentionItemsRepository } from "@/api/attention/domain/ports/attention-items.repository";
import { DrizzleAttentionItemsRepository } from "@/api/attention/infrastructure/persistence/drizzle-attention-items.repository";
import { MessageAttentionHandler } from "@/api/attention/presentation/events/message-attention.handler";
import { TagCalendarAttentionHandler } from "@/api/attention/presentation/events/tag-calendar-attention.handler";
import { TaskAttentionHandler } from "@/api/attention/presentation/events/task-attention.handler";
import { AttentionItemsController } from "@/api/attention/presentation/rest/attention-items.controller";
import { AttentionBroadcaster } from "@/api/attention/presentation/ws/attention.broadcaster";
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
    AttentionBroadcaster,
  ],
  controllers: [AttentionItemsController],
})
export class AttentionModule {}
