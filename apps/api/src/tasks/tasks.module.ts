import { Module } from "@nestjs/common";

import { AttentionItemsModule } from "@/api/attention-items/attention-items.module";
import { NetworksModule } from "@/api/networks/networks.module";
import { TagsModule } from "@/api/tags/tags.module";
import { TaskBatchesRepository } from "@/api/tasks/repositories/task-batches.repository";
import { TaskSuggestionsRepository } from "@/api/tasks/repositories/task-suggestions.repository";
import { TasksRepository } from "@/api/tasks/repositories/tasks.repository";
import { TaskBatchesController } from "@/api/tasks/rest/task-batches.controller";
import { TaskSuggestionsController } from "@/api/tasks/rest/task-suggestions.controller";
import { TasksController } from "@/api/tasks/rest/tasks.controller";
import { TaskBatchesService } from "@/api/tasks/services/task-batches.service";
import { TaskSuggestionsService } from "@/api/tasks/services/task-suggestions.service";
import { TasksService } from "@/api/tasks/services/tasks.service";

@Module({
  imports: [AttentionItemsModule, NetworksModule, TagsModule],
  providers: [
    TasksRepository,
    TaskBatchesRepository,
    TaskSuggestionsRepository,
    TasksService,
    TaskBatchesService,
    TaskSuggestionsService,
  ],
  controllers: [
    TasksController,
    TaskBatchesController,
    TaskSuggestionsController,
  ],
})
export class TasksModule {}
