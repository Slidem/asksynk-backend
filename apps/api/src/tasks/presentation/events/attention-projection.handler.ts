import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { EventHandler } from "@/api/platform/events/decorators/event-handler.decorator";
import { EventsPublisher } from "@/api/platform/events/publisher/events-publisher";
import {
  AttentionSourceRemoved,
  AttentionSourceUpserted,
  TaskBatchDeleted,
  TaskBatchUpserted,
  TaskDeleted,
  TaskSuggested,
  TaskSuggestionResolved,
  TaskSuggestionUpdated,
  TaskUpserted,
} from "@/api/platform/events/registry/events.registry";
import { EventOf } from "@/api/platform/events/registry/events.types";
import {
  AttentionProjection,
  fromTask,
  fromTaskBatch,
  fromTaskSuggestion,
  taskBatchSource,
  taskSource,
} from "@/api/tasks/application/attention-projection.mapper";
import { TasksAttentionProjectionConsumerGroup } from "@/api/tasks/presentation/events/attention-projection.consumer-group";

// Tasks' outbound ACL: republishes its events in attention's language.
@Injectable()
export class TasksAttentionProjectionHandler {
  constructor(private readonly publisher: EventsPublisher) {}

  @Transactional()
  @EventHandler(TaskUpserted, TasksAttentionProjectionConsumerGroup)
  async onTaskUpserted(p: EventOf<typeof TaskUpserted>): Promise<void> {
    await this.publish(fromTask(p));
  }

  @Transactional()
  @EventHandler(TaskDeleted, TasksAttentionProjectionConsumerGroup)
  async onTaskDeleted(p: EventOf<typeof TaskDeleted>): Promise<void> {
    await this.publisher.publish(AttentionSourceRemoved, {
      userId: p.assigneeUserId,
      source: taskSource(p.taskId),
    });
  }

  @Transactional()
  @EventHandler(TaskBatchUpserted, TasksAttentionProjectionConsumerGroup)
  async onTaskBatchUpserted(
    p: EventOf<typeof TaskBatchUpserted>,
  ): Promise<void> {
    await this.publish(fromTaskBatch(p));
  }

  @Transactional()
  @EventHandler(TaskBatchDeleted, TasksAttentionProjectionConsumerGroup)
  async onTaskBatchDeleted(p: EventOf<typeof TaskBatchDeleted>): Promise<void> {
    await this.publisher.publish(AttentionSourceRemoved, {
      userId: p.assigneeUserId,
      source: taskBatchSource(p.taskBatchId),
    });
  }

  @Transactional()
  @EventHandler(TaskSuggested, TasksAttentionProjectionConsumerGroup)
  async onTaskSuggested(p: EventOf<typeof TaskSuggested>): Promise<void> {
    await this.publisher.publish(
      AttentionSourceUpserted,
      fromTaskSuggestion(p),
    );
  }

  @Transactional()
  @EventHandler(TaskSuggestionUpdated, TasksAttentionProjectionConsumerGroup)
  async onTaskSuggestionUpdated(
    p: EventOf<typeof TaskSuggestionUpdated>,
  ): Promise<void> {
    await this.publisher.publish(
      AttentionSourceUpserted,
      fromTaskSuggestion(p),
    );
  }

  @Transactional()
  @EventHandler(TaskSuggestionResolved, TasksAttentionProjectionConsumerGroup)
  async onTaskSuggestionResolved(
    p: EventOf<typeof TaskSuggestionResolved>,
  ): Promise<void> {
    await this.publisher.publish(
      AttentionSourceUpserted,
      fromTaskSuggestion(p),
    );
  }

  private async publish(projection: AttentionProjection): Promise<void> {
    if (projection.kind === "upserted") {
      await this.publisher.publish(AttentionSourceUpserted, projection.payload);
    } else {
      await this.publisher.publish(AttentionSourceRemoved, projection.payload);
    }
  }
}
