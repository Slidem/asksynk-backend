import { Module } from "@nestjs/common";
import { NatsModule } from "@/api/common/nats/nats.module";
import { TagRepository } from "@/api/tags/tags.repository";
import { TagsController } from "@/api/tags/tags.controller";
import { TagsService } from "@/api/tags/tags.service";

@Module({
  imports: [NatsModule],
  providers: [TagRepository, TagsService],
  controllers: [TagsController],
})
export class TagsModule {}
