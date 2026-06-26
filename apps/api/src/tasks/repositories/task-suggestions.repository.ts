import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { and, desc, eq } from "drizzle-orm";

import { TxAdapter } from "@/api/infrastructure/db/tx.module";
import { TaskSuggestion } from "@/api/tasks/entities/task-suggestion.entity";
import {
  CreateTaskSuggestionInput,
  TaskSuggestionPayload,
  TaskSuggestionStatus,
} from "@/api/tasks/models/task.model";
import { taskSuggestions } from "@/migrations/schema/taskSuggestions";

type TaskSuggestionRow = typeof taskSuggestions.$inferSelect;

@Injectable()
export class TaskSuggestionsRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  async add(
    id: string,
    input: CreateTaskSuggestionInput,
  ): Promise<TaskSuggestion> {
    const [created] = await this.txHost.tx
      .insert(taskSuggestions)
      .values({
        id,
        suggesterUserId: input.suggesterUserId,
        suggesteeUserId: input.suggesteeUserId,
        payload: input.payload as unknown as Record<string, unknown>,
      })
      .returning();
    return this.mapRow(created);
  }

  async getById(id: string): Promise<TaskSuggestion | null> {
    const [row] = await this.txHost.tx
      .select()
      .from(taskSuggestions)
      .where(eq(taskSuggestions.id, id));
    return row ? this.mapRow(row) : null;
  }

  // Reverse lookups: trace a materialized task/batch back to its suggestion so a
  // task-status change can rebroadcast the parent suggestion.
  async findByMaterializedTaskId(
    taskId: string,
  ): Promise<TaskSuggestion | null> {
    const [row] = await this.txHost.tx
      .select()
      .from(taskSuggestions)
      .where(eq(taskSuggestions.materializedTaskId, taskId));
    return row ? this.mapRow(row) : null;
  }

  async findByMaterializedBatchId(
    batchId: string,
  ): Promise<TaskSuggestion | null> {
    const [row] = await this.txHost.tx
      .select()
      .from(taskSuggestions)
      .where(eq(taskSuggestions.materializedBatchId, batchId));
    return row ? this.mapRow(row) : null;
  }

  async updateStatus(
    id: string,
    status: TaskSuggestionStatus,
  ): Promise<TaskSuggestion | null> {
    const [row] = await this.txHost.tx
      .update(taskSuggestions)
      .set({ status, updatedAt: new Date() })
      .where(eq(taskSuggestions.id, id))
      .returning();
    return row ? this.mapRow(row) : null;
  }

  // Accept + record the materialized link in one write (XOR: task or batch).
  async markAccepted(
    id: string,
    link: { materializedTaskId?: string; materializedBatchId?: string },
  ): Promise<TaskSuggestion | null> {
    const [row] = await this.txHost.tx
      .update(taskSuggestions)
      .set({
        status: "accepted",
        materializedTaskId: link.materializedTaskId ?? null,
        materializedBatchId: link.materializedBatchId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(taskSuggestions.id, id))
      .returning();
    return row ? this.mapRow(row) : null;
  }

  async updatePayload(
    id: string,
    payload: TaskSuggestionPayload,
  ): Promise<TaskSuggestion | null> {
    const [row] = await this.txHost.tx
      .update(taskSuggestions)
      .set({
        payload: payload as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(taskSuggestions.id, id))
      .returning();
    return row ? this.mapRow(row) : null;
  }

  async listForSuggester(
    suggesterUserId: string,
    status?: TaskSuggestionStatus,
  ): Promise<TaskSuggestion[]> {
    const filters = [eq(taskSuggestions.suggesterUserId, suggesterUserId)];
    if (status) filters.push(eq(taskSuggestions.status, status));
    return this.runList(filters);
  }

  async listForSuggestee(
    suggesteeUserId: string,
    status?: TaskSuggestionStatus,
  ): Promise<TaskSuggestion[]> {
    const filters = [eq(taskSuggestions.suggesteeUserId, suggesteeUserId)];
    if (status) filters.push(eq(taskSuggestions.status, status));
    return this.runList(filters);
  }

  private async runList(
    filters: ReturnType<typeof eq>[],
  ): Promise<TaskSuggestion[]> {
    const rows = await this.txHost.tx
      .select()
      .from(taskSuggestions)
      .where(and(...filters))
      .orderBy(desc(taskSuggestions.createdAt));
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: TaskSuggestionRow): TaskSuggestion {
    return TaskSuggestion.create({
      id: row.id,
      suggesterUserId: row.suggesterUserId,
      suggesteeUserId: row.suggesteeUserId,
      status: row.status as TaskSuggestionStatus,
      payload: row.payload as unknown as TaskSuggestionPayload,
      materializedTaskId: row.materializedTaskId,
      materializedBatchId: row.materializedBatchId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
