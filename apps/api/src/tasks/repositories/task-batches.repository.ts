import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { eq } from "drizzle-orm";

import { TxAdapter } from "@/api/infrastructure/db/tx.module";
import { TaskBatch } from "@/api/tasks/entities/task-batch.entity";
import { taskBatchTags } from "@/migrations/schema/taskBatchTags";
import { taskBatches } from "@/migrations/schema/taskBatches";

type TaskBatchRow = typeof taskBatches.$inferSelect;

@Injectable()
export class TaskBatchesRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  async add(
    id: string,
    input: {
      createdBy: string;
      assigneeUserId: string;
      title: string;
      description: string | null;
      dueDate: Date | null;
      tagIds: string[];
    },
  ): Promise<TaskBatch> {
    const [created] = await this.txHost.tx
      .insert(taskBatches)
      .values({
        id,
        createdBy: input.createdBy,
        assigneeUserId: input.assigneeUserId,
        title: input.title,
        description: input.description,
        dueDate: input.dueDate,
      })
      .returning();

    await this.replaceTags(id, input.tagIds);

    return this.mapRow(created, input.tagIds);
  }

  async getById(id: string): Promise<TaskBatch | null> {
    const [row] = await this.txHost.tx
      .select()
      .from(taskBatches)
      .where(eq(taskBatches.id, id));
    if (!row) return null;
    const tagIds = await this.tagIdsFor(id);
    return this.mapRow(row, tagIds);
  }

  async update(batch: TaskBatch): Promise<TaskBatch> {
    const [updated] = await this.txHost.tx
      .update(taskBatches)
      .set({
        title: batch.title,
        description: batch.description,
        dueDate: batch.dueDate,
        updatedAt: new Date(),
      })
      .where(eq(taskBatches.id, batch.id))
      .returning();

    await this.replaceTags(batch.id, batch.tagIds);

    return this.mapRow(updated, batch.tagIds);
  }

  async softDelete(id: string): Promise<void> {
    await this.txHost.tx
      .update(taskBatches)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(taskBatches.id, id));
  }

  private async tagIdsFor(batchId: string): Promise<string[]> {
    const rows = await this.txHost.tx
      .select({ tagId: taskBatchTags.tagId })
      .from(taskBatchTags)
      .where(eq(taskBatchTags.batchId, batchId));
    return rows.map((r) => r.tagId);
  }

  private async replaceTags(batchId: string, tagIds: string[]): Promise<void> {
    await this.txHost.tx
      .delete(taskBatchTags)
      .where(eq(taskBatchTags.batchId, batchId));
    if (tagIds.length > 0) {
      await this.txHost.tx
        .insert(taskBatchTags)
        .values(tagIds.map((tagId) => ({ batchId, tagId })));
    }
  }

  private mapRow(row: TaskBatchRow, tagIds: string[]): TaskBatch {
    return TaskBatch.create({
      id: row.id,
      createdBy: row.createdBy,
      assigneeUserId: row.assigneeUserId,
      title: row.title,
      description: row.description,
      dueDate: row.dueDate,
      tagIds,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
