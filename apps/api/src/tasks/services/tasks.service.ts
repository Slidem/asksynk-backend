import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

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
import { EventsPublisher } from "@/shared/event-publisher/events-publisher";
import {
  TaskDeleted,
  TaskUpserted,
} from "@/shared/event-registry/events.registry";
import { generateId } from "@/shared/id";

@Injectable()
export class TasksService {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly tags: TagsService,
    private readonly taskBatches: TaskBatchesService,
    private readonly eventsPublisher: EventsPublisher,
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
      // Adding a child shifts the batch aggregate; the batch owns the item.
      await this.taskBatches.emitBatchUpserted(input.batchId);
      return task;
    }

    // Standalone task: assignee = creator. Tags must belong to the assignee.
    await this.tags.assertOwnedBy(input.assigneeUserId, input.tagIds);
    const task = await this.tasksRepository.add(generateId(), input);
    await this.publishTaskUpserted(task);
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

    if (input.title !== undefined) task.title = input.title;
    if (input.description !== undefined) task.description = input.description;
    if (input.dueDate !== undefined) task.dueDate = input.dueDate;
    if (input.status !== undefined) task.status = input.status;
    if (input.tagIds !== undefined) {
      await this.tags.assertOwnedBy(task.assigneeUserId, input.tagIds);
      task.tagIds = input.tagIds;
    }

    const saved = await this.tasksRepository.update(task);

    if (saved.batchId) {
      // Only a child's status moves the batch aggregate; title/description don't.
      if (input.status !== undefined && input.status !== prevStatus) {
        await this.taskBatches.emitBatchUpserted(saved.batchId);
      }
    } else {
      await this.publishTaskUpserted(saved);
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
      await this.taskBatches.emitBatchUpserted(task.batchId);
    } else {
      await this.eventsPublisher.publish(TaskDeleted, { taskId: id });
    }
  }

  // One durable event carrying the full post-state; the attention-items consumer
  // creates/updates/removes the assignee's single "task" item. Untagged tasks
  // produce no item (the consumer no-ops). Due date is derived consumer-side.
  private async publishTaskUpserted(task: Task): Promise<void> {
    await this.eventsPublisher.publish(TaskUpserted, {
      taskId: task.id,
      assigneeUserId: task.assigneeUserId,
      title: task.title,
      status: mapTaskStatusToAttention(task.status),
      tagIds: task.tagIds,
      dueDate: task.dueDate ? task.dueDate.toISOString() : null,
      dueDatePinned: task.dueDate !== null,
      createdAt: task.createdAt.toISOString(),
    });
  }
}
