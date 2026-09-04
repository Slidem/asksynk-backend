import { Module } from "@nestjs/common";

import { NetworksModule } from "@/api/networks/networks.module";
import { EventsPublisherModule } from "@/api/platform/events/publisher/events-publisher.module";
import { TagRepository } from "@/api/tags/repositories/tags.repository";
import { TagsController } from "@/api/tags/rest/tags.controller";
import { TagsService } from "@/api/tags/services/tags.service";

@Module({
  imports: [EventsPublisherModule, NetworksModule],
  providers: [TagRepository, TagsService],
  controllers: [TagsController],
  exports: [TagsService],
})
export class TagsModule {}
