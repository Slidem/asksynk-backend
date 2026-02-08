import { TagRepository } from "@/api/repository/tag.repository";
import { TagsController } from "@/api/routes/tags.controller";
import { TagsService } from "@/api/services/tags.service";
import { Module } from "@nestjs/common";

@Module({
  providers: [TagRepository, TagsService],
  controllers: [TagsController],
})
export class TagsModule {}
