import { Module } from "@nestjs/common";

import { TagRepository } from "@/api/tags/repositories/tags.repository";
import { TagsController } from "@/api/tags/rest/tags.controller";
import { TagsService } from "@/api/tags/services/tags.service";
import { MessageBusModule } from "@/shared/message-bus/message-bus.module";

@Module({
  imports: [MessageBusModule],
  providers: [TagRepository, TagsService],
  controllers: [TagsController],
})
export class TagsModule {}
