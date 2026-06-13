import "reflect-metadata";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import { and, eq, inArray, or, SQL, sql } from "drizzle-orm";
import * as path from "path";
import request from "supertest";

import { AttentionItemsModule } from "@/api/attention-items/attention-items.module";
import { AttentionItemResponse } from "@/api/attention-items/rest/responses/attention-item.response";
import { AuthUser } from "@/api/auth/auth.types";
import { ClockModule } from "@/api/common/clock/clock.module";
import { EventsModule } from "@/api/events/events.module";
import {
  DB_CLIENT_PROVIDER,
  DbModule,
} from "@/api/infrastructure/db/db.module";
import { TxModule } from "@/api/infrastructure/db/tx.module";
import { NetworksModule } from "@/api/networks/networks.module";
import { TagsModule } from "@/api/tags/tags.module";
import { TaskResponse } from "@/api/tasks/rest/responses/task.response";
import { TaskBatchResponse } from "@/api/tasks/rest/responses/task-batch.response";
import { TaskSuggestionResponse } from "@/api/tasks/rest/responses/task-suggestion.response";
import { TasksModule } from "@/api/tasks/tasks.module";
import { attentionItems } from "@/migrations/schema/attentionItems";
import { eventsOutbox } from "@/migrations/schema/outbox";
import { tags as tagsTable } from "@/migrations/schema/tags";
import { taskBatches } from "@/migrations/schema/taskBatches";
import { tasks } from "@/migrations/schema/tasks";
import { taskSuggestions } from "@/migrations/schema/taskSuggestions";
import { userNetwork } from "@/migrations/schema/userNetwork";
import { users } from "@/migrations/schema/users";
import { generateId } from "@/shared/id";
import { MockAuthGuard } from "@/test/helpers/mockAuthGuard";
import { pollUntil } from "@/test/helpers/pollUntil";
import {
  makeTestUser,
  testUserRegistry,
} from "@/test/helpers/testUserRegistry";

const POLL_TIMEOUT_MS = 4000;
const ASSERT_TOLERANCE_MS = 5000;

interface TaskMeta {
  type: "task";
  title: string;
  taskId?: string;
  taskBatchId?: string;
}

interface SuggestedTaskMeta {
  type: "suggested_task";
  suggestionId: string;
  suggesterUserId: string;
  title: string;
}

function taskMeta(i: AttentionItemResponse): TaskMeta {
  return i.metadata as unknown as TaskMeta;
}

function suggMeta(i: AttentionItemResponse): SuggestedTaskMeta {
  return i.metadata as unknown as SuggestedTaskMeta;
}

function isoNoMillis(d: Date): string {
  return d.toISOString().replace(/\.\d{3}/, "");
}

describe("Tasks → Attention Items (integration)", () => {
  let app: INestApplication;
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let owner: AuthUser;
  let suggester: AuthUser;
  let userIds: string[];

  beforeAll(async () => {
    owner = makeTestUser();
    suggester = makeTestUser();
    testUserRegistry.register(owner, { default: true });
    testUserRegistry.register(suggester);
    userIds = [owner.id, suggester.id];

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: path.resolve(__dirname, "../../.env.test"),
        }),
        DbModule,
        TxModule,
        EventsModule,
        NetworksModule,
        TagsModule,
        AttentionItemsModule,
        TasksModule,
        ClockModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: MockAuthGuard }],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    db = module.get(DB_CLIENT_PROVIDER);

    await db
      .insert(users)
      .values([
        {
          id: owner.id,
          email: owner.email,
          name: owner.name,
          emailVerified: true,
        },
        {
          id: suggester.id,
          email: suggester.email,
          name: suggester.name,
          emailVerified: true,
        },
      ])
      .onConflictDoNothing();

    // Active connection both ways so the suggester may suggest to the owner.
    await db.insert(userNetwork).values([
      { userId: owner.id, connectionId: suggester.id },
      { userId: suggester.id, connectionId: owner.id },
    ]);
  });

  afterAll(async () => {
    await db.delete(userNetwork).where(inArray(userNetwork.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    testUserRegistry.clear();
    await app.close();
  });

  beforeEach(async () => {
    await db
      .delete(attentionItems)
      .where(inArray(attentionItems.userId, userIds));
    await db
      .delete(tasks)
      .where(
        or(
          inArray(tasks.assigneeUserId, userIds),
          inArray(tasks.createdBy, userIds),
        ),
      );
    await db
      .delete(taskBatches)
      .where(
        or(
          inArray(taskBatches.assigneeUserId, userIds),
          inArray(taskBatches.createdBy, userIds),
        ),
      );
    await db
      .delete(taskSuggestions)
      .where(
        or(
          inArray(taskSuggestions.suggesterUserId, userIds),
          inArray(taskSuggestions.suggesteeUserId, userIds),
        ),
      );
    await db.delete(tagsTable).where(inArray(tagsTable.userId, userIds));
  });

  // ---- REST drivers ----

  async function createTag(
    responseTimeMillis = 30 * 60 * 1000,
  ): Promise<string> {
    const id = generateId();
    await request(app.getHttpServer())
      .post("/tags")
      .set("x-test-user-id", owner.id)
      .send({
        id,
        name: `tag-${id}`,
        answerMode: { type: "immediately", responseTimeMillis },
      })
      .expect(201);
    return id;
  }

  async function createTask(body: object): Promise<TaskResponse> {
    const res = await request(app.getHttpServer())
      .post("/tasks")
      .set("x-test-user-id", owner.id)
      .send(body)
      .expect(201);
    return res.body;
  }

  async function patchTask(id: string, body: object): Promise<void> {
    await request(app.getHttpServer())
      .patch(`/tasks/${id}`)
      .set("x-test-user-id", owner.id)
      .send(body)
      .expect(200);
  }

  async function deleteTask(id: string): Promise<void> {
    await request(app.getHttpServer())
      .delete(`/tasks/${id}`)
      .set("x-test-user-id", owner.id)
      .expect(204);
  }

  async function createBatch(body: object): Promise<TaskBatchResponse> {
    const res = await request(app.getHttpServer())
      .post("/task-batches")
      .set("x-test-user-id", owner.id)
      .send(body)
      .expect(201);
    return res.body;
  }

  async function patchBatch(id: string, body: object): Promise<void> {
    await request(app.getHttpServer())
      .patch(`/task-batches/${id}`)
      .set("x-test-user-id", owner.id)
      .send(body)
      .expect(200);
  }

  async function deleteBatch(id: string): Promise<void> {
    await request(app.getHttpServer())
      .delete(`/task-batches/${id}`)
      .set("x-test-user-id", owner.id)
      .expect(204);
  }

  async function suggest(payload: object): Promise<TaskSuggestionResponse> {
    const res = await request(app.getHttpServer())
      .post("/task-suggestions")
      .set("x-test-user-id", suggester.id)
      .send({ suggesteeUserId: owner.id, payload })
      .expect(201);
    return res.body;
  }

  async function setSuggestionStatus(
    id: string,
    status: "accepted" | "rejected",
  ): Promise<void> {
    await request(app.getHttpServer())
      .patch(`/task-suggestions/${id}`)
      .set("x-test-user-id", owner.id)
      .send({ status })
      .expect(200);
  }

  async function rescindSuggestion(id: string): Promise<void> {
    await request(app.getHttpServer())
      .delete(`/task-suggestions/${id}`)
      .set("x-test-user-id", suggester.id)
      .expect(204);
  }

  async function editSuggestion(id: string, body: object): Promise<void> {
    await request(app.getHttpServer())
      .patch(`/task-suggestions/${id}`)
      .set("x-test-user-id", suggester.id)
      .send(body)
      .expect(200);
  }

  // ---- attention-item polling ----

  async function getItems(): Promise<AttentionItemResponse[]> {
    const res = await request(app.getHttpServer())
      .get("/attention-items")
      .set("x-test-user-id", owner.id)
      .expect(200);
    return res.body;
  }

  async function awaitItem(
    predicate: (i: AttentionItemResponse) => boolean,
  ): Promise<AttentionItemResponse> {
    const items = await pollUntil(getItems, (xs) => xs.some(predicate), {
      timeoutMs: POLL_TIMEOUT_MS,
    });
    return items.find(predicate)!;
  }

  async function awaitItemState(
    id: string,
    predicate: (i: AttentionItemResponse) => boolean,
  ): Promise<AttentionItemResponse> {
    const items = await pollUntil(
      getItems,
      (xs) => {
        const i = xs.find((x) => x.id === id);
        return !!i && predicate(i);
      },
      { timeoutMs: POLL_TIMEOUT_MS },
    );
    return items.find((x) => x.id === id)!;
  }

  async function awaitNoItem(
    predicate: (i: AttentionItemResponse) => boolean,
  ): Promise<void> {
    await pollUntil(getItems, (xs) => !xs.some(predicate), {
      timeoutMs: POLL_TIMEOUT_MS,
    });
  }

  function approxEqual(actual: string | null, expected: Date): boolean {
    if (!actual) return false;
    return (
      Math.abs(new Date(actual).getTime() - expected.getTime()) <
      ASSERT_TOLERANCE_MS
    );
  }

  async function awaitOutbox(
    eventType: string,
    idAccessor: SQL,
    id: string,
  ): Promise<{ payload: unknown; deliveryMode: string }> {
    const rows = await pollUntil(
      () =>
        db
          .select({
            payload: eventsOutbox.payload,
            deliveryMode: eventsOutbox.deliveryMode,
          })
          .from(eventsOutbox)
          .where(
            and(
              eq(eventsOutbox.eventType, eventType),
              sql`${idAccessor} = ${id}`,
            ),
          ),
      (xs) => xs.length > 0,
      { timeoutMs: POLL_TIMEOUT_MS },
    );
    return rows[0];
  }

  // =====================================================================
  // Standalone tasks
  // =====================================================================

  describe("standalone tasks", () => {
    it("creates an item when a tagged task is created for yourself", async () => {
      const tagId = await createTag();
      const task = await createTask({ title: "Ship it", tagIds: [tagId] });

      const item = await awaitItem((i) => taskMeta(i).taskId === task.id);

      expect(item.type).toBe("task");
      expect(item.userId).toBe(owner.id);
      expect(item.status).toBe("created");
      expect(item.tagIds).toEqual([tagId]);
      expect(
        approxEqual(item.dueDate, new Date(Date.now() + 30 * 60 * 1000)),
      ).toBe(true);
    });

    it("creates no item for an untagged task", async () => {
      const task = await createTask({ title: "No tags" });
      await awaitNoItem((i) => taskMeta(i).taskId === task.id);
    });

    it("updates the SAME item (no new id) when the title changes", async () => {
      const tagId = await createTag();
      const task = await createTask({ title: "Old title", tagIds: [tagId] });
      const item = await awaitItem((i) => taskMeta(i).taskId === task.id);

      await patchTask(task.id, { title: "New title" });

      const updated = await awaitItemState(
        item.id,
        (i) => taskMeta(i).title === "New title",
      );
      expect(updated.id).toBe(item.id);
    });

    it("updates the same item when tags change and recomputes due date", async () => {
      const fast = await createTag(10 * 60 * 1000);
      const slow = await createTag(60 * 60 * 1000);
      const task = await createTask({ title: "Retag", tagIds: [slow] });
      const item = await awaitItem((i) => taskMeta(i).taskId === task.id);

      await patchTask(task.id, { tagIds: [fast] });

      const updated = await awaitItemState(
        item.id,
        (i) => i.tagIds.length === 1 && i.tagIds[0] === fast,
      );
      expect(updated.id).toBe(item.id);
    });

    it("removes the item when all tags are cleared", async () => {
      const tagId = await createTag();
      const task = await createTask({ title: "Will untag", tagIds: [tagId] });
      await awaitItem((i) => taskMeta(i).taskId === task.id);

      await patchTask(task.id, { tagIds: [] });

      await awaitNoItem((i) => taskMeta(i).taskId === task.id);
    });

    it("pins the due date when one is set explicitly", async () => {
      const tagId = await createTag();
      const task = await createTask({ title: "Pin me", tagIds: [tagId] });
      const item = await awaitItem((i) => taskMeta(i).taskId === task.id);

      const due = new Date(Date.now() + 5 * 60 * 60 * 1000);
      await patchTask(task.id, { dueDate: isoNoMillis(due) });

      const updated = await awaitItemState(item.id, (i) =>
        approxEqual(i.dueDate, due),
      );
      expect(updated.id).toBe(item.id);
    });

    it("mirrors status changes onto the item", async () => {
      const tagId = await createTag();
      const task = await createTask({ title: "Progress", tagIds: [tagId] });
      const item = await awaitItem((i) => taskMeta(i).taskId === task.id);

      await patchTask(task.id, { status: "in_progress" });
      const inProgress = await awaitItemState(
        item.id,
        (i) => i.status === "in_progress",
      );
      expect(inProgress.id).toBe(item.id);
    });

    it("resolves the item when the task is completed", async () => {
      const tagId = await createTag();
      const task = await createTask({ title: "Finish", tagIds: [tagId] });
      const item = await awaitItem((i) => taskMeta(i).taskId === task.id);

      await patchTask(task.id, { status: "completed" });

      const resolved = await awaitItemState(
        item.id,
        (i) => i.status === "resolved",
      );
      expect(resolved.id).toBe(item.id);
    });

    it("removes the item when the task is deleted", async () => {
      const tagId = await createTag();
      const task = await createTask({ title: "Delete me", tagIds: [tagId] });
      await awaitItem((i) => taskMeta(i).taskId === task.id);

      await deleteTask(task.id);

      await awaitNoItem((i) => taskMeta(i).taskId === task.id);
    });
  });

  // =====================================================================
  // Batches
  // =====================================================================

  describe("batches", () => {
    function batchBody(tagId: string) {
      return {
        title: "Sprint",
        tagIds: [tagId],
        tasks: [{ title: "a" }, { title: "b" }],
      };
    }

    it("creates exactly one item for a tagged batch", async () => {
      const tagId = await createTag();
      const batch = await createBatch(batchBody(tagId));

      const item = await awaitItem((i) => taskMeta(i).taskBatchId === batch.id);
      expect(item.status).toBe("created");

      const items = await getItems();
      expect(
        items.filter((i) => taskMeta(i).taskBatchId === batch.id),
      ).toHaveLength(1);
    });

    it("goes in_progress when one of two children completes", async () => {
      const tagId = await createTag();
      const batch = await createBatch(batchBody(tagId));
      const item = await awaitItem((i) => taskMeta(i).taskBatchId === batch.id);

      await patchTask(batch.tasks[0].id, { status: "completed" });

      const updated = await awaitItemState(
        item.id,
        (i) => i.status === "in_progress",
      );
      expect(updated.id).toBe(item.id);
    });

    it("resolves only when all children complete (same id throughout)", async () => {
      const tagId = await createTag();
      const batch = await createBatch(batchBody(tagId));
      const item = await awaitItem((i) => taskMeta(i).taskBatchId === batch.id);

      await patchTask(batch.tasks[0].id, { status: "completed" });
      await patchTask(batch.tasks[1].id, { status: "completed" });

      const resolved = await awaitItemState(
        item.id,
        (i) => i.status === "resolved",
      );
      expect(resolved.id).toBe(item.id);
    });

    it("re-aggregates without a new item when a child is added", async () => {
      const tagId = await createTag();
      const batch = await createBatch(batchBody(tagId));
      const item = await awaitItem((i) => taskMeta(i).taskBatchId === batch.id);

      await createTask({ title: "c", batchId: batch.id });

      // Still exactly one item for the batch.
      await new Promise((r) => setTimeout(r, 500));
      const items = await getItems();
      const batchItems = items.filter(
        (i) => taskMeta(i).taskBatchId === batch.id,
      );
      expect(batchItems).toHaveLength(1);
      expect(batchItems[0].id).toBe(item.id);
    });

    it("updates the same item when batch tags change", async () => {
      const tagId = await createTag();
      const other = await createTag(60 * 60 * 1000);
      const batch = await createBatch(batchBody(tagId));
      const item = await awaitItem((i) => taskMeta(i).taskBatchId === batch.id);

      await patchBatch(batch.id, { tagIds: [other] });

      const updated = await awaitItemState(
        item.id,
        (i) => i.tagIds.length === 1 && i.tagIds[0] === other,
      );
      expect(updated.id).toBe(item.id);
    });

    it("removes the item when the batch is deleted", async () => {
      const tagId = await createTag();
      const batch = await createBatch(batchBody(tagId));
      await awaitItem((i) => taskMeta(i).taskBatchId === batch.id);

      await deleteBatch(batch.id);

      await awaitNoItem((i) => taskMeta(i).taskBatchId === batch.id);
    });
  });

  // =====================================================================
  // Suggestions
  // =====================================================================

  describe("suggestions", () => {
    it("opens an untagged suggested_task inbox item for the suggestee", async () => {
      const sugg = await suggest({ kind: "task", title: "Please do X" });

      const item = await awaitItem((i) => suggMeta(i).suggestionId === sugg.id);
      expect(item.type).toBe("suggested_task");
      expect(item.userId).toBe(owner.id);
      expect(item.tagIds).toEqual([]);
      expect(suggMeta(item).suggesterUserId).toBe(suggester.id);
    });

    it("resolves the suggestion item AND creates a real task item on accept", async () => {
      const tagId = await createTag();
      const sugg = await suggest({
        kind: "task",
        title: "Adopt the tag",
        tagIds: [tagId],
      });
      const suggItem = await awaitItem(
        (i) => suggMeta(i).suggestionId === sugg.id,
      );

      await setSuggestionStatus(sugg.id, "accepted");

      await awaitItemState(suggItem.id, (i) => i.status === "resolved");
      const taskItem = await awaitItem(
        (i) =>
          i.type === "task" &&
          i.tagIds.includes(tagId) &&
          i.status !== "resolved",
      );
      expect(taskItem.id).not.toBe(suggItem.id);
      expect(taskMeta(taskItem).taskId).toBeDefined();
    });

    it("resolves the item and creates no task on reject", async () => {
      const sugg = await suggest({ kind: "task", title: "Nope" });
      const suggItem = await awaitItem(
        (i) => suggMeta(i).suggestionId === sugg.id,
      );

      await setSuggestionStatus(sugg.id, "rejected");

      await awaitItemState(suggItem.id, (i) => i.status === "resolved");
      const items = await getItems();
      expect(items.some((i) => i.type === "task")).toBe(false);
    });

    it("resolves the item when the suggester rescinds", async () => {
      const sugg = await suggest({ kind: "task", title: "Take it back" });
      const suggItem = await awaitItem(
        (i) => suggMeta(i).suggestionId === sugg.id,
      );

      await rescindSuggestion(sugg.id);

      await awaitItemState(suggItem.id, (i) => i.status === "resolved");
    });

    it("updates the SAME suggestion item when the pending payload is edited", async () => {
      const sugg = await suggest({ kind: "task", title: "Draft title" });
      const suggItem = await awaitItem(
        (i) => suggMeta(i).suggestionId === sugg.id,
      );

      await editSuggestion(sugg.id, { title: "Edited title" });

      const updated = await awaitItemState(
        suggItem.id,
        (i) => suggMeta(i).title === "Edited title",
      );
      expect(updated.id).toBe(suggItem.id);
    });
  });

  // =====================================================================
  // Notification model
  // =====================================================================

  describe("notification model", () => {
    it("publishes a realtime attention.upserted matching the GET response", async () => {
      const tagId = await createTag();
      const task = await createTask({ title: "Notify", tagIds: [tagId] });
      const item = await awaitItem((i) => taskMeta(i).taskId === task.id);

      const row = await awaitOutbox(
        "attention.upserted",
        sql`${eventsOutbox.payload}->'item'->>'id'`,
        item.id,
      );
      expect(row.deliveryMode).toBe("realtime");
      expect((row.payload as { item: AttentionItemResponse }).item).toEqual(
        item,
      );
    });

    it("publishes attention.removed when a task-sourced item is deleted", async () => {
      const tagId = await createTag();
      const task = await createTask({ title: "Removable", tagIds: [tagId] });
      const item = await awaitItem((i) => taskMeta(i).taskId === task.id);

      await deleteTask(task.id);

      const row = await awaitOutbox(
        "attention.removed",
        sql`${eventsOutbox.payload}->>'id'`,
        item.id,
      );
      expect(row.deliveryMode).toBe("realtime");
      expect((row.payload as { userId: string }).userId).toBe(owner.id);
    });
  });
});
