import { Module } from "@nestjs/common";

import { NetworksModule } from "@/api/networks/networks.module";
import { EventsPublisherModule } from "@/api/platform/events/publisher/events-publisher.module";
import { TagCatalogPort } from "@/api/tagging/contract/tag-catalog.port";
import { TagRepository } from "@/api/tagging/domain/ports/tag.repository";
import { DrizzleTagRepository } from "@/api/tagging/repositories/drizzle-tag.repository";
import { TagsController } from "@/api/tagging/rest/tags.controller";
import { TagsService } from "@/api/tagging/services/tags.service";

@Module({
  imports: [EventsPublisherModule, NetworksModule],
  providers: [
    { provide: TagRepository, useClass: DrizzleTagRepository },
    TagsService,
    { provide: TagCatalogPort, useExisting: TagsService },
  ],
  controllers: [TagsController],
  exports: [TagCatalogPort],
})
export class TaggingModule {}
