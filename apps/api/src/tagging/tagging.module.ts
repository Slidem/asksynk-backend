import { Module } from "@nestjs/common";

import { NetworkModule } from "@/api/network/network.module";
import { EventsPublisherModule } from "@/api/platform/events/publisher/events-publisher.module";
import { TagsService } from "@/api/tagging/application/tags.service";
import { TagCatalogPort } from "@/api/tagging/contract/tag-catalog.port";
import { TagRepository } from "@/api/tagging/domain/ports/tag.repository";
import { DrizzleTagRepository } from "@/api/tagging/infrastructure/persistence/drizzle-tag.repository";
import { TagsController } from "@/api/tagging/presentation/rest/tags.controller";

@Module({
  imports: [EventsPublisherModule, NetworkModule],
  providers: [
    { provide: TagRepository, useClass: DrizzleTagRepository },
    TagsService,
    { provide: TagCatalogPort, useExisting: TagsService },
  ],
  controllers: [TagsController],
  exports: [TagCatalogPort],
})
export class TaggingModule {}
