import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { AttentionDueDateService } from "@/api/attention-items/attention-due-date.service";
import { AttentionItemsRepository } from "@/api/attention-items/attention-items.repository";
import { AttentionItemsService } from "@/api/attention-items/attention-items.service";
import { EventHandler } from "@/shared/event-consumer/event-consumer.decorator";
import {
  TaskBatchDeleted,
  TaskBatchUpserted,
  TaskDeleted,
  TaskSuggested,
  TaskSuggestionResolved,
  TaskSuggestionUpdated,
  TaskUpserted,
} from "@/shared/event-registry/events.registry";
import { EventOf } from "@/shared/event-registry/events.types";
import { generateId } from "@/shared/id";

// Mirrors task / batch / suggestion domain events into attention items. Tasks and
// batches both produce a single "task" item (one per assignee); suggestions an
// untagged "suggested_task" inbox item.
@Injectable()
export class TaskAttentionHandler {
  constructor(
    private readonly attentionItemsRepository: AttentionItemsRepository,
    private readonly attentionItemsService: AttentionItemsService,
    private readonly dueDateService: AttentionDueDateService,
  ) {}

  @Transactional()
  @EventHandler(TaskUpserted, { group: "attention-items" })
  async onTaskUpserted(payload: EventOf<typeof TaskUpserted>): Promise<void> {
    const { dueDate, sourceCalendarEventId } = await this.deriveDueDate(payload);
    await this.attentionItemsService.upsertFromSource({
      source: { taskId: payload.taskId },
      userId: payload.assigneeUserId,
      title: payload.title,
      status: payload.status,
      tagIds: payload.tagIds,
      dueDate,
      dueDatePinned: payload.dueDatePinned,
      sourceCalendarEventId,
    });
  }

  @Transactional()
  @EventHandler(TaskDeleted, { group: "attention-items" })
  async onTaskDeleted(payload: EventOf<typeof TaskDeleted>): Promise<void> {
    await this.attentionItemsService.deleteBySource({ taskId: payload.taskId });
  }

  @Transactional()
  @EventHandler(TaskBatchUpserted, { group: "attention-items" })
  async onTaskBatchUpserted(
    payload: EventOf<typeof TaskBatchUpserted>,
  ): Promise<void> {
    const { dueDate, sourceCalendarEventId } = await this.deriveDueDate(payload);
    await this.attentionItemsService.upsertFromSource({
      source: { taskBatchId: payload.taskBatchId },
      userId: payload.assigneeUserId,
      title: payload.title,
      status: payload.aggregateStatus,
      tagIds: payload.tagIds,
      dueDate,
      dueDatePinned: payload.dueDatePinned,
      sourceCalendarEventId,
    });
  }

  @Transactional()
  @EventHandler(TaskBatchDeleted, { group: "attention-items" })
  async onTaskBatchDeleted(
    payload: EventOf<typeof TaskBatchDeleted>,
  ): Promise<void> {
    await this.attentionItemsService.deleteBySource({
      taskBatchId: payload.taskBatchId,
    });
  }

  @Transactional()
  @EventHandler(TaskSuggested, { group: "attention-items" })
  async onTaskSuggested(payload: EventOf<typeof TaskSuggested>): Promise<void> {
    // Idempotent under redelivery: one inbox item per suggestion.
    const existing = await this.attentionItemsRepository.findBySuggestionId(
      payload.suggestionId,
    );
    if (existing.length > 0) return;

    const dueDate = payload.dueDate ? new Date(payload.dueDate) : null;
    await this.attentionItemsService.create({
      id: generateId(),
      userId: payload.suggesteeUserId,
      type: "suggested_task",
      dueDate,
      dueDatePinned: dueDate !== null,
      metadata: {
        type: "suggested_task",
        suggestionId: payload.suggestionId,
        suggesterUserId: payload.suggesterUserId,
        title: payload.title,
      },
      tagIds: [],
      sourceCalendarEventId: null,
    });
  }

  @Transactional()
  @EventHandler(TaskSuggestionResolved, { group: "attention-items" })
  async onTaskSuggestionResolved(
    payload: EventOf<typeof TaskSuggestionResolved>,
  ): Promise<void> {
    await this.attentionItemsService.syncSourceStatus(
      { suggestionId: payload.suggestionId },
      "resolved",
    );
  }

  @Transactional()
  @EventHandler(TaskSuggestionUpdated, { group: "attention-items" })
  async onTaskSuggestionUpdated(
    payload: EventOf<typeof TaskSuggestionUpdated>,
  ): Promise<void> {
    await this.attentionItemsService.syncSourceContent(
      { suggestionId: payload.suggestionId },
      {
        title: payload.title,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
      },
    );
  }

  // Pinned items keep their explicit date; otherwise derive from the source's
  // tags, anchored to its creation time so later edits don't move the deadline.
  private async deriveDueDate(payload: {
    tagIds: string[];
    dueDate: string | null;
    dueDatePinned: boolean;
    createdAt: string;
  }): Promise<{ dueDate: Date | null; sourceCalendarEventId: string | null }> {
    if (payload.dueDatePinned) {
      return {
        dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
        sourceCalendarEventId: null,
      };
    }
    return this.dueDateService.deriveFromTags(
      payload.tagIds,
      new Date(payload.createdAt),
    );
  }
}
