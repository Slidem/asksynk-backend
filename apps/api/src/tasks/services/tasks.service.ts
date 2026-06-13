import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { AttentionDueDateService } from "@/api/attention-items/attention-due-date.service";
import { AttentionItemsService } from "@/api/attention-items/attention-items.service";
import { AsksynkError } from "@/api/common/errors/errors.model";
import { TagsService } from "@/api/tags/services/tags.service";
import { Task } from "@/api/tasks/entities/task.entity";
import {
  CreateTaskInput,
  ListTasksInput,
  UpdateTaskInput,
} from "@/api/tasks/models/task.model";
import { TasksRepository } from "@/api/tasks/repositories/tasks.repository";
import { TaskBatchesService } from "@/api/tasks/services/task-batches.service";
import { mapTaskStatusToAttention } from "@/api/tasks/task-status.util";
import { generateId } from "@/shared/id";

@Injectable()
export class TasksService {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly attentionItems: AttentionItemsService,
    private readonly tags: TagsService,
    private readonly dueDate: AttentionDueDateService,
    private readonly taskBatches: TaskBatchesService,
  ) {}

  @Transactional()
  async create(input: CreateTaskInput): Promise<Task> {
    // Batched task: tags + due date live on the batch; only its assignee may add.
    if (input.batchId) {
      const batch = await this.taskBatches.requireAssignee(
        input.createdBy,
        input.batchId,
      );
      if (input.tagIds.length > 0 || input.dueDate != null) {
        throw AsksynkError.badRequest(
          "Tags and due date are managed at batch level",
        );
      }
      const task = await this.tasksRepository.add(generateId(), {
        ...input,
        assigneeUserId: batch.assigneeUserId,
        tagIds: [],
        dueDate: null,
      });
      await this.taskBatches.resyncBatchAttention(input.batchId);
      return task;
    }

    // Standalone task: assignee = creator. Tags must belong to the assignee.
    await this.tags.assertOwnedBy(input.assigneeUserId, input.tagIds);
    const task = await this.tasksRepository.add(generateId(), input);
    if (task.tagIds.length > 0) {
      await this.createTaskAttentionItem(task);
    }
    return task;
  }

  @Transactional()
  async getTask(userId: string, id: string): Promise<Task> {
    const task = await this.tasksRepository.getById(id);
    if (!task || task.isDeleted || !task.isVisibleTo(userId)) {
      throw AsksynkError.notFound("Task not found");
    }
    return task;
  }

  @Transactional()
  async listTasks(userId: string, input: ListTasksInput): Promise<Task[]> {
    return this.tasksRepository.listByScope(userId, input);
  }

  @Transactional()
  async updateTask(input: UpdateTaskInput): Promise<Task> {
    const task = await this.tasksRepository.getById(input.id);
    if (!task || task.isDeleted || !task.isVisibleTo(input.userId)) {
      throw AsksynkError.notFound("Task not found");
    }
    // The assignee owns the task — only they may edit (incl. status).
    if (!task.isAssignee(input.userId)) {
      throw AsksynkError.forbidden("Only the assignee can edit this task");
    }
    // Batched tasks: tags + due date are managed at batch level.
    if (
      task.batchId &&
      (input.tagIds !== undefined || input.dueDate !== undefined)
    ) {
      throw AsksynkError.badRequest(
        "Tags and due date are managed at batch level",
      );
    }

    const prevStatus = task.status;
    let tagsChanged = false;
    let dueDateChanged = false;

    if (input.title !== undefined) task.title = input.title;
    if (input.description !== undefined) task.description = input.description;
    if (input.dueDate !== undefined) {
      task.dueDate = input.dueDate;
      dueDateChanged = true;
    }
    if (input.status !== undefined) task.status = input.status;
    if (input.tagIds !== undefined) {
      await this.tags.assertOwnedBy(task.assigneeUserId, input.tagIds);
      task.tagIds = input.tagIds;
      tagsChanged = true;
    }

    const saved = await this.tasksRepository.update(task);
    const statusChanged =
      input.status !== undefined && input.status !== prevStatus;

    if (saved.batchId) {
      if (statusChanged) {
        await this.taskBatches.recomputeBatchStatus(saved.batchId);
      }
    } else if (tagsChanged || dueDateChanged) {
      await this.resyncTaskItems(saved);
    } else if (statusChanged) {
      await this.attentionItems.syncSourceStatus(
        { taskId: saved.id },
        mapTaskStatusToAttention(saved.status),
      );
    }

    return saved;
  }

  @Transactional()
  async deleteTask(userId: string, id: string): Promise<void> {
    const task = await this.tasksRepository.getById(id);
    if (!task || task.isDeleted || !task.isVisibleTo(userId)) {
      throw AsksynkError.notFound("Task not found");
    }
    if (!task.isAssignee(userId)) {
      throw AsksynkError.forbidden("Only the assignee can delete this task");
    }
    await this.tasksRepository.softDelete(id);
    if (task.batchId) {
      await this.taskBatches.resyncBatchAttention(task.batchId);
    } else {
      await this.attentionItems.deleteBySource({ taskId: id });
    }
  }

  // One attention item for the assignee. Explicit due date pins (survives
  // tag/calendar recomputes); otherwise it is derived from the assignee's tags.
  // Caller guarantees the task is tagged (untagged → no attention item).
  private async createTaskAttentionItem(task: Task): Promise<void> {
    const pinned = task.dueDate !== null;
    const { dueDate, sourceCalendarEventId } = pinned
      ? { dueDate: task.dueDate, sourceCalendarEventId: null }
      : await this.dueDate.deriveFromTags(task.tagIds, new Date());

    await this.attentionItems.create({
      id: generateId(),
      userId: task.assigneeUserId,
      type: "task",
      dueDate,
      dueDatePinned: pinned,
      metadata: { type: "task", title: task.title, taskId: task.id },
      tagIds: task.tagIds,
      sourceCalendarEventId,
    });
  }

  // Rebuilds a standalone task's attention item to reflect current tags + due
  // date, then re-applies its status. No-op (just removal) when untagged.
  private async resyncTaskItems(task: Task): Promise<void> {
    await this.attentionItems.deleteBySource({ taskId: task.id });
    if (task.tagIds.length === 0) return;
    await this.createTaskAttentionItem(task);
    await this.attentionItems.syncSourceStatus(
      { taskId: task.id },
      mapTaskStatusToAttention(task.status),
    );
  }
}
