import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";

import { TxAdapter } from "@/api/infrastructure/db/tx.module";
import { Task } from "@/api/tasks/entities/task.entity";
import {
  CreateTaskInput,
  ListTasksInput,
  TaskStatus,
} from "@/api/tasks/models/task.model";
import { taskTags } from "@/migrations/schema/taskTags";
import { tasks } from "@/migrations/schema/tasks";

type TaskRow = typeof tasks.$inferSelect;

@Injectable()
export class TasksRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  async add(id: string, input: CreateTaskInput): Promise<Task> {
    const [created] = await this.txHost.tx
      .insert(tasks)
      .values({
        id,
        batchId: input.batchId ?? null,
        createdBy: input.createdBy,
        assigneeUserId: input.assigneeUserId,
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate ?? null,
      })
      .returning();

    await this.replaceTags(id, input.tagIds);

    return this.mapRow(created, input.tagIds);
  }

  async getById(id: string): Promise<Task | null> {
    const [row] = await this.txHost.tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, id));
    if (!row) return null;
    const [task] = await this.hydrate([row]);
    return task;
  }

  async listByScope(userId: string, input: ListTasksInput): Promise<Task[]> {
    const filters = [isNull(tasks.deletedAt)];

    if (input.status) filters.push(eq(tasks.status, input.status));
    if (input.batchId) filters.push(eq(tasks.batchId, input.batchId));
    if (input.cursor) filters.push(lt(tasks.createdAt, new Date(input.cursor)));

    if (input.scope === "created_by_me") {
      filters.push(eq(tasks.createdBy, userId));
    } else {
      // assigned_to_me
      filters.push(eq(tasks.assigneeUserId, userId));
    }

    const rows = await this.txHost.tx
      .select()
      .from(tasks)
      .where(and(...filters))
      .orderBy(desc(tasks.createdAt))
      .limit(input.limit ?? 50);

    return this.hydrate(rows);
  }

  async listByBatchId(batchId: string): Promise<Task[]> {
    const rows = await this.txHost.tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.batchId, batchId), isNull(tasks.deletedAt)))
      .orderBy(desc(tasks.createdAt));
    return this.hydrate(rows);
  }

  async update(task: Task): Promise<Task> {
    const [updated] = await this.txHost.tx
      .update(tasks)
      .set({
        title: task.title,
        description: task.description,
        status: task.status,
        dueDate: task.dueDate,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, task.id))
      .returning();

    await this.replaceTags(task.id, task.tagIds);

    return this.mapRow(updated, task.tagIds);
  }

  async softDelete(id: string): Promise<void> {
    await this.txHost.tx
      .update(tasks)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(tasks.id, id));
  }

  async softDeleteByBatchId(batchId: string): Promise<void> {
    await this.txHost.tx
      .update(tasks)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(tasks.batchId, batchId), isNull(tasks.deletedAt)));
  }

  async listStatusesByBatchId(batchId: string): Promise<TaskStatus[]> {
    const rows = await this.txHost.tx
      .select({ status: tasks.status })
      .from(tasks)
      .where(and(eq(tasks.batchId, batchId), isNull(tasks.deletedAt)));
    return rows.map((r) => r.status as TaskStatus);
  }

  private async replaceTags(taskId: string, tagIds: string[]): Promise<void> {
    await this.txHost.tx.delete(taskTags).where(eq(taskTags.taskId, taskId));
    if (tagIds.length > 0) {
      await this.txHost.tx
        .insert(taskTags)
        .values(tagIds.map((tagId) => ({ taskId, tagId })));
    }
  }

  private async hydrate(rows: TaskRow[]): Promise<Task[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);

    const tagRows = await this.txHost.tx
      .select()
      .from(taskTags)
      .where(inArray(taskTags.taskId, ids));

    const tagsByTask = new Map<string, string[]>();
    for (const t of tagRows) {
      const list = tagsByTask.get(t.taskId) ?? [];
      list.push(t.tagId);
      tagsByTask.set(t.taskId, list);
    }

    return rows.map((r) => this.mapRow(r, tagsByTask.get(r.id) ?? []));
  }

  private mapRow(row: TaskRow, tagIds: string[]): Task {
    return Task.create({
      id: row.id,
      batchId: row.batchId,
      createdBy: row.createdBy,
      assigneeUserId: row.assigneeUserId,
      title: row.title,
      description: row.description,
      status: row.status as TaskStatus,
      dueDate: row.dueDate,
      tagIds,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
