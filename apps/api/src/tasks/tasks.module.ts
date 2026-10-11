import { Module } from "@nestjs/common";

import { NetworksModule } from "@/api/networks/networks.module";
import { EventsPublisherModule } from "@/api/platform/events/publisher/events-publisher.module";
import { TaggingModule } from "@/api/tagging/tagging.module";
import { TaskBatchesRepository } from "@/api/tasks/domain/ports/task-batches.repository";
import { TaskSuggestionsRepository } from "@/api/tasks/domain/ports/task-suggestions.repository";
import { TasksRepository } from "@/api/tasks/domain/ports/tasks.repository";
import { DrizzleTaskBatchesRepository } from "@/api/tasks/repositories/drizzle-task-batches.repository";
import { DrizzleTaskSuggestionsRepository } from "@/api/tasks/repositories/drizzle-task-suggestions.repository";
import { DrizzleTasksRepository } from "@/api/tasks/repositories/drizzle-tasks.repository";
import { TaskBatchesController } from "@/api/tasks/rest/task-batches.controller";
import { TaskSuggestionsController } from "@/api/tasks/rest/task-suggestions.controller";
import { TasksController } from "@/api/tasks/rest/tasks.controller";
import { TaskBatchesService } from "@/api/tasks/services/task-batches.service";
import { TaskSuggestionsService } from "@/api/tasks/services/task-suggestions.service";
import { TasksService } from "@/api/tasks/services/tasks.service";

@Module({
  imports: [NetworksModule, TaggingModule, EventsPublisherModule],
  providers: [
    { provide: TasksRepository, useClass: DrizzleTasksRepository },
    { provide: TaskBatchesRepository, useClass: DrizzleTaskBatchesRepository },
    { provide: TaskSuggestionsRepository, useClass: DrizzleTaskSuggestionsRepository },
    TasksService,
    TaskBatchesService,
    TaskSuggestionsService,
  ],
  controllers: [
    TasksController,
    TaskBatchesController,
    TaskSuggestionsController,
  ],
  exports: [TaskSuggestionsService],
})
export class TasksModule {}
