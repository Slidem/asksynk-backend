import { Module } from "@nestjs/common";

import { NatsModule } from "@/api/infrastructure/nats/nats.module";
import { TagRepository } from "@/api/tags/repositories/tags.repository";
import { TagsController } from "@/api/tags/rest/tags.controller";
import { TagsService } from "@/api/tags/services/tags.service";

@Module({
  imports: [NatsModule],
  providers: [TagRepository, TagsService],
  controllers: [TagsController],
})
export class TagsModule {}
