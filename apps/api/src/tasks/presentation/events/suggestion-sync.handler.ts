import { Injectable } from "@nestjs/common";

import { EventHandler } from "@/api/platform/events/decorators/event-handler.decorator";
import {
  TaskBatchUpserted,
  TaskUpserted,
} from "@/api/platform/events/registry/events.registry";
import { EventOf } from "@/api/platform/events/registry/events.types";
import { TaskSuggestionsService } from "@/api/tasks/application/task-suggestions.service";
import { SuggestionSyncConsumerGroup } from "@/api/tasks/presentation/events/suggestion-sync.consumer-group";

// Materialized tasks/batches changed: rebroadcast their parent suggestion. Own
// consumer group so it never starves the attention-items consumer of the same events.
@Injectable()
export class SuggestionSyncHandler {
  constructor(private readonly suggestions: TaskSuggestionsService) {}

  @EventHandler(TaskUpserted, SuggestionSyncConsumerGroup)
  async onMaterializedTaskChanged(
    payload: EventOf<typeof TaskUpserted>,
  ): Promise<void> {
    await this.suggestions.rebroadcastForMaterializedTask(payload.taskId);
  }

  @EventHandler(TaskBatchUpserted, SuggestionSyncConsumerGroup)
  async onMaterializedBatchChanged(
    payload: EventOf<typeof TaskBatchUpserted>,
  ): Promise<void> {
    await this.suggestions.rebroadcastForMaterializedBatch(payload.taskBatchId);
  }
}
