import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

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
import { EventsPublisher } from "@/shared/event-publisher/events-publisher";
import {
  TaskBatchDeleted,
  TaskBatchUpserted,
} from "@/shared/event-registry/events.registry";
import { generateId } from "@/shared/id";

@Injectable()
export class TaskBatchesService {
  constructor(
    private readonly batchesRepository: TaskBatchesRepository,
    private readonly tasksRepository: TasksRepository,
    private readonly tags: TagsService,
    private readonly eventsPublisher: EventsPublisher,
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
      dueDate: input.dueDate ?? null,
      tagIds: input.tagIds,
    });

    // Created via the repo (not TasksService) so children emit no task events —
    // the batch owns the single attention item.
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

    await this.emitBatchUpserted(batch.id);

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

    if (input.title !== undefined) batch.title = input.title;
    if (input.dueDate !== undefined) batch.dueDate = input.dueDate;
    if (input.tagIds !== undefined) {
      await this.tags.assertOwnedBy(batch.assigneeUserId, input.tagIds);
      batch.tagIds = input.tagIds;
    }

    const saved = await this.batchesRepository.update(batch);
    await this.emitBatchUpserted(saved.id);
    return saved;
  }

  @Transactional()
  async deleteBatch(userId: string, id: string): Promise<void> {
    const batch = await this.requireAssignee(userId, id);
    await this.tasksRepository.softDeleteByBatchId(batch.id);
    await this.batchesRepository.softDelete(batch.id);
    await this.eventsPublisher.publish(TaskBatchDeleted, {
      taskBatchId: batch.id,
    });
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

  // One durable event carrying the batch's full post-state + aggregate status
  // (computed here from child statuses, so the consumer needs no task access).
  // The consumer creates/updates/removes the assignee's single "task" item.
  @Transactional()
  async emitBatchUpserted(batchId: string): Promise<void> {
    const batch = await this.batchesRepository.getById(batchId);
    if (!batch || batch.isDeleted) return;

    const statuses = await this.tasksRepository.listStatusesByBatchId(batchId);
    await this.eventsPublisher.publish(TaskBatchUpserted, {
      taskBatchId: batch.id,
      assigneeUserId: batch.assigneeUserId,
      title: batch.title,
      aggregateStatus: aggregateBatchStatus(statuses),
      tagIds: batch.tagIds,
      dueDate: batch.dueDate ? batch.dueDate.toISOString() : null,
      dueDatePinned: batch.dueDate !== null,
      createdAt: batch.createdAt.toISOString(),
    });
  }
}
