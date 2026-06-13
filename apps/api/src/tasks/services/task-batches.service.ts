import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { AttentionDueDateService } from "@/api/attention-items/attention-due-date.service";
import { AttentionItemsService } from "@/api/attention-items/attention-items.service";
import { AsksynkError } from "@/api/common/errors/errors.model";
import { TagsService } from "@/api/tags/services/tags.service";
import { Task } from "@/api/tasks/entities/task.entity";
import { TaskBatch } from "@/api/tasks/entities/task-batch.entity";
import {
  CreateTaskBatchInput,
  UpdateTaskBatchInput,
} from "@/api/tasks/models/task.model";
import { TaskBatchesRepository } from "@/api/tasks/repositories/task-batches.repository";
import { TasksRepository } from "@/api/tasks/repositories/tasks.repository";
import { aggregateBatchStatus } from "@/api/tasks/task-status.util";
import { generateId } from "@/shared/id";

@Injectable()
export class TaskBatchesService {
  constructor(
    private readonly batchesRepository: TaskBatchesRepository,
    private readonly tasksRepository: TasksRepository,
    private readonly attentionItems: AttentionItemsService,
    private readonly tags: TagsService,
    private readonly dueDate: AttentionDueDateService,
  ) {}

  @Transactional()
  async create(input: CreateTaskBatchInput): Promise<TaskBatch> {
    if (input.tasks.length === 0) {
      throw AsksynkError.badRequest("A batch needs at least one task");
    }
    // Tags + due date are batch-level and must belong to the assignee.
    await this.tags.assertOwnedBy(input.assigneeUserId, input.tagIds);

    const batchId = generateId();
    const batch = await this.batchesRepository.add(batchId, {
      createdBy: input.createdBy,
      assigneeUserId: input.assigneeUserId,
      title: input.title,
      description: input.description ?? null,
      dueDate: input.dueDate ?? null,
      tagIds: input.tagIds,
    });

    for (const t of input.tasks) {
      await this.tasksRepository.add(generateId(), {
        createdBy: input.createdBy,
        assigneeUserId: input.assigneeUserId,
        title: t.title,
        description: t.description ?? null,
        dueDate: null,
        tagIds: [],
        batchId,
      });
    }

    if (batch.tagIds.length > 0) {
      await this.createBatchAttentionItem(batch);
    }

    return batch;
  }

  @Transactional()
  async getBatch(userId: string, id: string): Promise<TaskBatch> {
    const batch = await this.batchesRepository.getById(id);
    if (!batch || batch.isDeleted || !batch.isVisibleTo(userId)) {
      throw AsksynkError.notFound("Task batch not found");
    }
    return batch;
  }

  async listBatchTasks(batchId: string): Promise<Task[]> {
    return this.tasksRepository.listByBatchId(batchId);
  }

  @Transactional()
  async updateBatch(input: UpdateTaskBatchInput): Promise<TaskBatch> {
    const batch = await this.requireAssignee(input.userId, input.id);

    let tagsChanged = false;
    let dueDateChanged = false;
    if (input.title !== undefined) batch.title = input.title;
    if (input.description !== undefined) batch.description = input.description;
    if (input.dueDate !== undefined) {
      batch.dueDate = input.dueDate;
      dueDateChanged = true;
    }
    if (input.tagIds !== undefined) {
      await this.tags.assertOwnedBy(batch.assigneeUserId, input.tagIds);
      batch.tagIds = input.tagIds;
      tagsChanged = true;
    }

    const saved = await this.batchesRepository.update(batch);
    if (tagsChanged || dueDateChanged) await this.resyncBatchAttention(saved.id);
    return saved;
  }

  @Transactional()
  async deleteBatch(userId: string, id: string): Promise<void> {
    const batch = await this.requireAssignee(userId, id);
    await this.tasksRepository.softDeleteByBatchId(batch.id);
    await this.batchesRepository.softDelete(batch.id);
    await this.attentionItems.deleteBySource({ taskBatchId: batch.id });
  }

  // Asserts the user owns the batch (is its assignee); returns it. Used by
  // update/delete and by TasksService when adding a task to a batch.
  async requireAssignee(userId: string, id: string): Promise<TaskBatch> {
    const batch = await this.batchesRepository.getById(id);
    if (!batch || batch.isDeleted || !batch.isVisibleTo(userId)) {
      throw AsksynkError.notFound("Task batch not found");
    }
    if (!batch.isAssignee(userId)) {
      throw AsksynkError.forbidden("Only the assignee can modify this batch");
    }
    return batch;
  }

  // Rebuilds the batch's single attention item (the assignee's) and re-applies
  // the aggregate status. No-op (removal only) when untagged.
  @Transactional()
  async resyncBatchAttention(batchId: string): Promise<void> {
    const batch = await this.batchesRepository.getById(batchId);
    if (!batch || batch.isDeleted) return;

    await this.attentionItems.deleteBySource({ taskBatchId: batchId });
    if (batch.tagIds.length === 0) return;

    await this.createBatchAttentionItem(batch);
    await this.applyAggregateStatus(batchId);
  }

  @Transactional()
  async recomputeBatchStatus(batchId: string): Promise<void> {
    const batch = await this.batchesRepository.getById(batchId);
    if (!batch || batch.isDeleted || batch.tagIds.length === 0) return;
    await this.applyAggregateStatus(batchId);
  }

  private async applyAggregateStatus(batchId: string): Promise<void> {
    const statuses = await this.tasksRepository.listStatusesByBatchId(batchId);
    await this.attentionItems.syncSourceStatus(
      { taskBatchId: batchId },
      aggregateBatchStatus(statuses),
    );
  }

  // One attention item for the batch's assignee. Explicit batch due date pins
  // (survives recomputes); otherwise derived from the assignee's batch tags.
  // Caller guarantees the batch is tagged (untagged → no attention item).
  private async createBatchAttentionItem(batch: TaskBatch): Promise<void> {
    const pinned = batch.dueDate !== null;
    const { dueDate, sourceCalendarEventId } = pinned
      ? { dueDate: batch.dueDate, sourceCalendarEventId: null }
      : await this.dueDate.deriveFromTags(batch.tagIds, new Date());

    await this.attentionItems.create({
      id: generateId(),
      userId: batch.assigneeUserId,
      type: "task",
      dueDate,
      dueDatePinned: pinned,
      metadata: { type: "task", title: batch.title, taskBatchId: batch.id },
      tagIds: batch.tagIds,
      sourceCalendarEventId,
    });
  }
}
