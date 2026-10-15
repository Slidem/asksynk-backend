import { Module } from "@nestjs/common";

import { NetworkModule } from "@/api/network/network.module";
import { EventsPublisherModule } from "@/api/platform/events/publisher/events-publisher.module";
import { TaggingModule } from "@/api/tagging/tagging.module";
import { TaskBatchesService } from "@/api/tasks/application/task-batches.service";
import { TaskSuggestionsService } from "@/api/tasks/application/task-suggestions.service";
import { TasksService } from "@/api/tasks/application/tasks.service";
import { TaskSuggestionPort } from "@/api/tasks/contract/task-suggestion.port";
import { TaskBatchesRepository } from "@/api/tasks/domain/ports/task-batches.repository";
import { TaskSuggestionsRepository } from "@/api/tasks/domain/ports/task-suggestions.repository";
import { TasksRepository } from "@/api/tasks/domain/ports/tasks.repository";
import { DrizzleTaskBatchesRepository } from "@/api/tasks/infrastructure/persistence/drizzle-task-batches.repository";
import { DrizzleTaskSuggestionsRepository } from "@/api/tasks/infrastructure/persistence/drizzle-task-suggestions.repository";
import { DrizzleTasksRepository } from "@/api/tasks/infrastructure/persistence/drizzle-tasks.repository";
import { SuggestionSyncHandler } from "@/api/tasks/presentation/events/suggestion-sync.handler";
import { TaskBatchesController } from "@/api/tasks/presentation/rest/task-batches.controller";
import { TaskSuggestionsController } from "@/api/tasks/presentation/rest/task-suggestions.controller";
import { TasksController } from "@/api/tasks/presentation/rest/tasks.controller";
import { TaskSuggestionsBroadcaster } from "@/api/tasks/presentation/ws/task-suggestions.broadcaster";

@Module({
  imports: [NetworkModule, TaggingModule, EventsPublisherModule],
  providers: [
    { provide: TasksRepository, useClass: DrizzleTasksRepository },
    { provide: TaskBatchesRepository, useClass: DrizzleTaskBatchesRepository },
    { provide: TaskSuggestionsRepository, useClass: DrizzleTaskSuggestionsRepository },
    TasksService,
    TaskBatchesService,
    TaskSuggestionsService,
    { provide: TaskSuggestionPort, useExisting: TaskSuggestionsService },
    SuggestionSyncHandler,
    TaskSuggestionsBroadcaster,
  ],
  controllers: [
    TasksController,
    TaskBatchesController,
    TaskSuggestionsController,
  ],
  exports: [TaskSuggestionPort],
})
export class TasksModule {}
