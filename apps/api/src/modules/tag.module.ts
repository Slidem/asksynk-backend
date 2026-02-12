import { Module } from "@nestjs/common";
import { NatsModule } from "@/api/modules/nats.module";
import { TagRepository } from "@/api/repository/tag.repository";
import { TagsController } from "@/api/routes/tags.controller";
import { TagsService } from "@/api/services/tags.service";

@Module({
  imports: [NatsModule],
  providers: [TagRepository, TagsService],
  controllers: [TagsController],
})
export class TagsModule {}
