import { Module } from "@nestjs/common";

import { AttentionItemsEventHandler } from "@/api/attention-items/attention-items.event-handler";
import { AttentionItemsRepository } from "@/api/attention-items/attention-items.repository";
import { AttentionItemsService } from "@/api/attention-items/attention-items.service";
import { AttentionItemsController } from "@/api/attention-items/rest/attention-items.controller";
import { TagRepository } from "@/api/tags/repositories/tags.repository";

@Module({
  providers: [
    AttentionItemsRepository,
    AttentionItemsService,
    AttentionItemsEventHandler,
    TagRepository,
  ],
  controllers: [AttentionItemsController],
})
export class AttentionItemsModule {}
