import { Module } from "@nestjs/common";

import { TagRepository } from "@/api/tags/repositories/tags.repository";
import { TagsController } from "@/api/tags/rest/tags.controller";
import { TagsService } from "@/api/tags/services/tags.service";
import { EventsPublisherModule } from "@/shared/event-publisher/events-publisher.module";
import { MessageBusModule } from "@/shared/message-bus/message-bus.module";

@Module({
  imports: [MessageBusModule, EventsPublisherModule],
  providers: [TagRepository, TagsService],
  controllers: [TagsController],
})
export class TagsModule {}
