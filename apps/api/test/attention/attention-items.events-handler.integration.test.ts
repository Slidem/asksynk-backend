import "reflect-metadata";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import * as dotenv from "dotenv";
import { and, eq, inArray, sql } from "drizzle-orm";
import * as path from "path";
import request from "supertest";

import { AttentionModule } from "@/api/attention/attention.module";
import { AttentionItemResponse } from "@/api/attention/presentation/rest/responses/attention-item.response";
import { MessagingService } from "@/api/conversations/application/messaging.service";
import { ConversationsModule } from "@/api/conversations/conversations.module";
import { ERROR_CATALOGUES } from "@/api/error-catalogs.root";
import { EventsModule } from "@/api/events/events.module";
import { FilesModule } from "@/api/files/files.module";
import { generateId } from "@/api/kernel/id";
import { NetworkModule } from "@/api/network/network.module";
import { ClockModule } from "@/api/platform/clock/clock.module";
import { DB_CLIENT_PROVIDER, DbModule } from "@/api/platform/db/db.module";
import { TxModule } from "@/api/platform/db/tx.module";
import { ErrorsModule } from "@/api/platform/errors/errors.module";
import { guestActor } from "@/api/platform/http/auth/actor.mapper";
import { AuthGuest, AuthUser } from "@/api/platform/http/auth/auth.types";
import { SchedulingModule } from "@/api/scheduling/scheduling.module";
import { SharingModule } from "@/api/sharing/sharing.module";
import { TaggingModule } from "@/api/tagging/tagging.module";
import { attentionItems } from "@/migrations/schema/attentionItems";
import { calendarEvents } from "@/migrations/schema/calendarEvents";
import { calendars } from "@/migrations/schema/calendars";
import {
  messages,
  messageThreads,
  threadParticipants,
} from "@/migrations/schema/messaging";
import { eventsOutbox } from "@/migrations/schema/outbox";
import { publicViewGuests, publicViews } from "@/migrations/schema/publicViews";
import { tags as tagsTable } from "@/migrations/schema/tags";
import { userNetwork } from "@/migrations/schema/userNetwork";
import { users } from "@/migrations/schema/users";
import { googleTestConfig } from "@/test/helpers/googleTestConfig";
import { sendInput, userActorOf } from "@/test/helpers/messagingActors";
import { MockAuthGuard } from "@/test/helpers/mockAuthGuard";
import { NoopRealtimeModule } from "@/test/helpers/noopRealtimeModule";
import { pollUntil } from "@/test/helpers/pollUntil";
import {
  makeTestUser,
  testUserRegistry,
} from "@/test/helpers/testUserRegistry";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

const POLL_TIMEOUT_MS = 10000;
const ASSERT_TOLERANCE_MS = 5000;

type ImmediateMode = { type: "immediately"; responseTimeMillis: number };
type TimeblockMode = { type: "timeblock" };
type AnswerModeInput = ImmediateMode | TimeblockMode;

// The response plus `dueSourceEventId`, read from the DB (not on the wire).
type TestItem = AttentionItemResponse & { dueSourceEventId: string | null };

function messageIdOf(i: AttentionItemResponse): string | null {
  return i.source.context === "conversations" && i.source.kind === "message"
    ? i.source.id
    : null;
}

function isoNoMillis(d: Date): string {
  return d.toISOString().replace(/\.\d{3}/, "");
}

function isoToTruncatedMillis(d: Date): string {
  return d.toISOString().replace(/\.\d{3}/, ".000");
}

describe("AttentionItemsEventHandler (integration)", () => {
  let app: INestApplication;
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let messagingService: MessagingService;
  let recipient: AuthUser;
  let sender: AuthUser;
  let threadId: string;
  let guest: AuthGuest;
  let guestThreadId: string;
  let publicViewId: string;

  beforeAll(async () => {
    recipient = makeTestUser();
    sender = makeTestUser();
    testUserRegistry.register(recipient, { default: true });
    testUserRegistry.register(sender);

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: path.resolve(__dirname, "../../.env.test"),
          load: [googleTestConfig],
        }),
        DbModule,
        TxModule,
        EventsModule,
        NoopRealtimeModule,
        ErrorsModule.forRoot(ERROR_CATALOGUES),
        NetworkModule,
        TaggingModule,
        SchedulingModule,
        ConversationsModule,
        AttentionModule,
        SharingModule,
        ClockModule,
        FilesModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: MockAuthGuard }],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    db = module.get(DB_CLIENT_PROVIDER);
    messagingService = module.get(MessagingService);

    await db
      .insert(users)
      .values([
        {
          id: recipient.id,
          email: recipient.email,
          name: recipient.name,
          emailVerified: true,
        },
        {
          id: sender.id,
          email: sender.email,
          name: sender.name,
          emailVerified: true,
        },
      ])
      .onConflictDoNothing();

    await db.insert(userNetwork).values([
      { userId: recipient.id, connectionId: sender.id },
      { userId: sender.id, connectionId: recipient.id },
    ]);

    threadId = generateId();

    await db
      .insert(messageThreads)
      .values({ id: threadId, publicViewId: null });

    await db.insert(threadParticipants).values([
      { threadId, userId: recipient.id, guestId: null },
      { threadId, userId: sender.id, guestId: null },
    ]);

    // Public view owned by recipient + a guest, plus the guest<->owner thread.
    publicViewId = generateId();
    const guestId = generateId();
    const farFuture = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.insert(publicViews).values({
      id: publicViewId,
      ownerUserId: recipient.id,
      slug: `slug-${publicViewId}`,
      expiresAt: farFuture,
    });
    await db.insert(publicViewGuests).values({
      id: guestId,
      publicViewId,
      displayName: "Guest",
      tokenHash: `token-${guestId}`,
      expiresAt: farFuture,
    });

    guestThreadId = generateId();
    await db.insert(messageThreads).values({ id: guestThreadId, publicViewId });
    await db.insert(threadParticipants).values([
      { threadId: guestThreadId, userId: recipient.id, guestId: null },
      { threadId: guestThreadId, userId: null, guestId },
    ]);

    guest = {
      id: guestId,
      publicViewId,
      ownerUserId: recipient.id,
      displayName: "Guest",
      expiresAt: farFuture,
    };
  });

  afterAll(async () => {
    await db
      .delete(threadParticipants)
      .where(eq(threadParticipants.threadId, threadId));
    await db.delete(messageThreads).where(eq(messageThreads.id, threadId));
    // Guest thread cascades participants + messages; public view cascades guests.
    await db.delete(messageThreads).where(eq(messageThreads.id, guestThreadId));
    await db.delete(publicViews).where(eq(publicViews.id, publicViewId));
    await db.delete(calendars).where(eq(calendars.userId, recipient.id));
    await db.delete(calendars).where(eq(calendars.userId, sender.id));
    await db
      .delete(userNetwork)
      .where(inArray(userNetwork.userId, [recipient.id, sender.id]));
    await db.delete(users).where(inArray(users.id, [recipient.id, sender.id]));
    testUserRegistry.clear();
    await app.close();
  });

  beforeEach(async () => {
    // Scope cleanup to the two test users only. Join tables cascade via FK.
    await db
      .delete(attentionItems)
      .where(eq(attentionItems.userId, recipient.id));
    await db.delete(messages).where(eq(messages.threadId, threadId));
    await db.delete(messages).where(eq(messages.threadId, guestThreadId));
    await db
      .delete(calendarEvents)
      .where(
        inArray(
          calendarEvents.calendarId,
          db
            .select({ id: calendars.id })
            .from(calendars)
            .where(eq(calendars.userId, recipient.id)),
        ),
      );
    await db.delete(tagsTable).where(eq(tagsTable.userId, recipient.id));
  });

  async function createTag(answerMode: AnswerModeInput): Promise<string> {
    const id = generateId();
    await request(app.getHttpServer())
      .post("/tags")
      .set("x-test-user-id", recipient.id)
      .send({ id, name: `tag-${id}`, answerMode })
      .expect(201);
    return id;
  }

  async function patchTag(id: string, body: object): Promise<void> {
    await request(app.getHttpServer())
      .patch(`/tags/${id}`)
      .set("x-test-user-id", recipient.id)
      .send(body)
      .expect(200);
  }

  async function createTimeblock(opts: {
    start: Date;
    durationSeconds?: number;
    tagIds?: string[];
    rrule?: string;
  }): Promise<string> {
    const id = generateId();
    await request(app.getHttpServer())
      .post("/calendar-events")
      .set("x-test-user-id", recipient.id)
      .send({
        id,
        title: "Timeblock",
        start: isoNoMillis(opts.start),
        durationSeconds: opts.durationSeconds ?? 3600,
        timezone: "UTC",
        tagIds: opts.tagIds,
        rrule: opts.rrule,
      })
      .expect(201);
    return id;
  }

  async function updateTimeblock(id: string, body: object): Promise<void> {
    await request(app.getHttpServer())
      .put(`/calendar-events/${id}`)
      .set("x-test-user-id", recipient.id)
      .send(body)
      .expect(200);
  }

  async function deleteTimeblock(id: string): Promise<void> {
    await request(app.getHttpServer())
      .delete(`/calendar-events/${id}`)
      .set("x-test-user-id", recipient.id)
      .expect(204);
  }

  async function deleteTag(id: string): Promise<void> {
    await request(app.getHttpServer())
      .delete(`/tags/${id}`)
      .set("x-test-user-id", recipient.id)
      .expect(204);
  }

  async function sendTaggedMessage(
    body: string,
    tagIds: string[],
  ): Promise<string> {
    const msg = await messagingService.send(
      userActorOf(sender.id),
      sendInput(threadId, body, tagIds),
    );
    return msg.id;
  }

  async function reTagMessage(
    messageId: string,
    tagIds: string[],
  ): Promise<void> {
    await messagingService.tagMessage(
      userActorOf(sender.id),
      messageId,
      tagIds,
    );
  }

  async function getItems(): Promise<TestItem[]> {
    const res = await request(app.getHttpServer())
      .get("/attention-items")
      .set("x-test-user-id", recipient.id)
      .expect(200);
    const items = res.body as AttentionItemResponse[];
    if (items.length === 0) return [];
    const rows = await db
      .select({
        id: attentionItems.id,
        dueSourceEventId: attentionItems.dueSourceEventId,
      })
      .from(attentionItems)
      .where(
        inArray(
          attentionItems.id,
          items.map((i) => i.id),
        ),
      );
    const bySource = new Map(rows.map((r) => [r.id, r.dueSourceEventId]));
    return items.map((i) => ({
      ...i,
      dueSourceEventId: bySource.get(i.id) ?? null,
    }));
  }

  async function getItemRow(
    id: string,
  ): Promise<{ id: string; deletedAt: Date | null } | null> {
    const [row] = await db
      .select({ id: attentionItems.id, deletedAt: attentionItems.deletedAt })
      .from(attentionItems)
      .where(eq(attentionItems.id, id));
    return row ?? null;
  }

  async function deleteItem(id: string): Promise<void> {
    await request(app.getHttpServer())
      .delete(`/attention-items/${id}`)
      .set("x-test-user-id", recipient.id)
      .expect(204);
  }

  async function resolveMessage(messageId: string): Promise<void> {
    await messagingService.updateManagedStatus(
      userActorOf(recipient.id),
      messageId,
      "resolved",
    );
  }

  // No event to wait on for "nothing happened": give both hops time to drain.
  function settle(): Promise<void> {
    return new Promise((r) => setTimeout(r, POLL_TIMEOUT_MS));
  }

  async function awaitItem(
    predicate: (i: TestItem) => boolean,
  ): Promise<TestItem> {
    const items = await pollUntil(getItems, (xs) => xs.some(predicate), {
      timeoutMs: POLL_TIMEOUT_MS,
    });
    return items.find(predicate)!;
  }

  async function awaitItemState(
    id: string,
    predicate: (i: TestItem) => boolean,
  ): Promise<TestItem> {
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
    predicate: (i: TestItem) => boolean,
  ): Promise<void> {
    await pollUntil(getItems, (xs) => !xs.some(predicate), {
      timeoutMs: POLL_TIMEOUT_MS,
    });
  }

  async function awaitOutboxAttentionUpserted(
    itemId: string,
  ): Promise<{ item: AttentionItemResponse }> {
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
              eq(eventsOutbox.eventType, "attention.upserted"),
              sql`${eventsOutbox.payload}->'item'->>'id' = ${itemId}`,
            ),
          ),
      (xs) => xs.length > 0,
      { timeoutMs: POLL_TIMEOUT_MS },
    );
    expect(rows[0].deliveryMode).toBe("realtime");
    return rows[0].payload as { item: AttentionItemResponse };
  }

  async function getMessageManaged(
    messageId: string,
  ): Promise<{ type: string; status: string } | null> {
    const [row] = await db
      .select({ managedStatus: messages.managedStatus })
      .from(messages)
      .where(eq(messages.id, messageId));
    return (row?.managedStatus as { type: string; status: string }) ?? null;
  }

  function approxEqual(actual: string | null, expected: Date): boolean {
    if (!actual) return false;

    return (
      Math.abs(new Date(actual).getTime() - expected.getTime()) <
      ASSERT_TOLERANCE_MS
    );
  }

  describe("Attention items events handler for messages", () => {
    it("should create new attention item when message is created with a tag associated with a timeblock", async () => {
      const start = new Date(Date.now() + 60 * 60 * 1000);
      const tagId = await createTag({ type: "timeblock" });
      const tbId = await createTimeblock({ start, tagIds: [tagId] });
      const msgId = await sendTaggedMessage("hello", [tagId]);

      const item = await awaitItem(
        (i) => messageIdOf(i) === msgId && i.dueDate !== null,
      );

      expect(approxEqual(item.dueDate, start)).toBe(true);
      expect(item.dueSourceEventId).toBe(tbId);
      expect(item.tagIds).toEqual([tagId]);
      expect(item.userId).toBe(recipient.id);
      expect(item.source).toEqual({
        context: "conversations",
        kind: "message",
        id: msgId,
      });
      expect(item.preview).toEqual({
        title: "hello",
        body: "hello",
        actor: { kind: "user", id: sender.id },
        meta: { threadId },
      });
      expect(item.dueDatePinned).toBe(false);
    });

    it("should create an attention item for the owner from a guest tagged message", async () => {
      const start = new Date(Date.now() + 60 * 60 * 1000);
      const tagId = await createTag({ type: "timeblock" });
      const tbId = await createTimeblock({ start, tagIds: [tagId] });

      const msg = await messagingService.send(
        guestActor(guest),
        sendInput(null, "hi from guest", [tagId]),
      );

      const item = await awaitItem(
        (i) => messageIdOf(i) === msg.id && i.dueDate !== null,
      );

      expect(item.userId).toBe(recipient.id);
      expect(item.preview.actor).toEqual({ kind: "guest", id: guest.id });
      expect(item.preview.meta).toEqual({ threadId: guestThreadId });
      expect(item.dueSourceEventId).toBe(tbId);
      expect(item.tagIds).toEqual([tagId]);
      expect(approxEqual(item.dueDate, start)).toBe(true);
    });

    it("should update the owner's attention item when a guest re-tags their own message", async () => {
      const tagA = await createTag({
        type: "immediately",
        responseTimeMillis: 30 * 60 * 1000,
      });
      const tagB = await createTag({
        type: "immediately",
        responseTimeMillis: 30 * 60 * 1000,
      });
      const msg = await messagingService.send(
        guestActor(guest),
        sendInput(null, "hi", [tagA]),
      );

      const item = await awaitItem((i) => messageIdOf(i) === msg.id);
      expect(item.tagIds).toEqual([tagA]);

      await messagingService.tagMessage(guestActor(guest), msg.id, [tagB]);

      await awaitItemState(
        item.id,
        (i) => i.tagIds.length === 1 && i.tagIds[0] === tagB,
      );
    });

    it("should reject a guest tagging with a tag the owner does not own", async () => {
      await expect(
        messagingService.send(
          guestActor(guest),
          sendInput(null, "hi", [generateId()]),
        ),
      ).rejects.toThrow();
    });

    it("should publish a realtime attention.upserted event identical to the GET response", async () => {
      const tagId = await createTag({
        type: "immediately",
        responseTimeMillis: 30 * 60 * 1000,
      });
      const msgId = await sendTaggedMessage("hello", [tagId]);

      const item = await awaitItem((i) => messageIdOf(i) === msgId);

      const { item: emitted } = await awaitOutboxAttentionUpserted(item.id);

      // Payload must match the GET /attention-items shape byte-for-byte.
      const wire: Partial<TestItem> = { ...item };
      delete wire.dueSourceEventId;
      expect(emitted).toEqual(wire);
      expect(emitted.tagIds.length).toBeGreaterThan(0);
    });

    it("should set due date to start of ongoing timeblock when message arrives during it", async () => {
      const start = new Date(Date.now() - 30 * 60 * 1000);
      const tagId = await createTag({ type: "timeblock" });
      const tbId = await createTimeblock({
        start,
        durationSeconds: 3600,
        tagIds: [tagId],
      });
      const msgId = await sendTaggedMessage("hello", [tagId]);

      const item = await awaitItem(
        (i) => messageIdOf(i) === msgId && i.dueDate !== null,
      );

      expect(approxEqual(item.dueDate, start)).toBe(true);
      expect(item.dueSourceEventId).toBe(tbId);
    });

    it("should create new attention item when message is created with immediate tag type", async () => {
      const responseTimeMillis = 30 * 60 * 1000;
      const tagId = await createTag({
        type: "immediately",
        responseTimeMillis,
      });
      const msgId = await sendTaggedMessage("hello", [tagId]);

      const item = await awaitItem(
        (i) => messageIdOf(i) === msgId && i.dueDate !== null,
      );

      const expected = new Date(
        new Date(item.createdAt).getTime() + responseTimeMillis,
      );
      expect(approxEqual(item.dueDate, expected)).toBe(true);
      expect(item.dueSourceEventId).toBeNull();
      expect(item.tagIds).toEqual([tagId]);
    });

    it("should remove attention item when all of multiple tags are cleared", async () => {
      const tagA = await createTag({
        type: "immediately",
        responseTimeMillis: 60 * 1000,
      });
      const tagB = await createTag({
        type: "immediately",
        responseTimeMillis: 60 * 1000,
      });
      const msgId = await sendTaggedMessage("hi", [tagA, tagB]);
      await awaitItem((i) => messageIdOf(i) === msgId);

      await reTagMessage(msgId, []);

      await awaitNoItem((i) => messageIdOf(i) === msgId);
    });

    it("should hard-delete attention item when message tags are removed", async () => {
      const tagId = await createTag({
        type: "immediately",
        responseTimeMillis: 60 * 1000,
      });
      const msgId = await sendTaggedMessage("hi", [tagId]);
      const item = await awaitItem((i) => messageIdOf(i) === msgId);

      await reTagMessage(msgId, []);

      await awaitNoItem((i) => messageIdOf(i) === msgId);
      expect(await getItemRow(item.id)).toBeNull();
    });

    it("should delete attention item when message tags are deleted", async () => {
      const tagId = await createTag({
        type: "timeblock",
      });

      const msgId = await sendTaggedMessage("hi", [tagId]);
      const item = await awaitItem((i) => messageIdOf(i) === msgId);

      await deleteTag(tagId);

      await awaitNoItem((i) => i.id === item.id);
    });

    it("should keep attention item with remaining tag when one of multiple tags is deleted", async () => {
      const tagA = await createTag({
        type: "immediately",
        responseTimeMillis: 60 * 60 * 1000,
      });
      const tagB = await createTag({
        type: "immediately",
        responseTimeMillis: 30 * 60 * 1000,
      });

      const msgId = await sendTaggedMessage("hi", [tagA, tagB]);
      const item = await awaitItem((i) => messageIdOf(i) === msgId);

      await deleteTag(tagA);

      const updated = await awaitItemState(
        item.id,
        (i) => i.tagIds.length === 1 && i.tagIds[0] === tagB,
      );
      expect(updated.tagIds).not.toContain(tagA);
    });

    it("should exclude deleted tag id from item tagIds returned by list endpoint", async () => {
      const tagA = await createTag({
        type: "immediately",
        responseTimeMillis: 60 * 60 * 1000,
      });
      const tagB = await createTag({
        type: "immediately",
        responseTimeMillis: 30 * 60 * 1000,
      });

      const msgId = await sendTaggedMessage("hi", [tagA, tagB]);
      const item = await awaitItem((i) => messageIdOf(i) === msgId);
      expect(item.tagIds.sort()).toEqual([tagA, tagB].sort());

      await deleteTag(tagB);

      await awaitItemState(
        item.id,
        (i) => !i.tagIds.includes(tagB) && i.tagIds.includes(tagA),
      );
    });

    it("should not remove resolved attention item when its only tag is deleted", async () => {
      const tagId = await createTag({
        type: "immediately",
        responseTimeMillis: 60 * 1000,
      });
      const msgId = await sendTaggedMessage("hi", [tagId]);
      const item = await awaitItem((i) => messageIdOf(i) === msgId);

      await resolveMessage(msgId);
      await awaitItemState(item.id, (i) => i.status === "resolved");

      await deleteTag(tagId);

      // give the handler time to process; then assert item is still present
      await settle();
      const items = await getItems();
      const found = items.find((i) => i.id === item.id);
      expect(found).toBeDefined();
      expect(found!.status).toBe("resolved");
      expect(found!.tagIds).toEqual([]);
    });

    it("should recompute due date for attention item when message tags are updated with new response time", async () => {
      const tagId = await createTag({
        type: "immediately",
        responseTimeMillis: 30 * 60 * 1000,
      });
      const msgId = await sendTaggedMessage("hi", [tagId]);
      const item = await awaitItem((i) => messageIdOf(i) === msgId);

      const newResponseTime = 60 * 60 * 1000;
      await patchTag(tagId, {
        answerMode: {
          type: "immediately",
          responseTimeMillis: newResponseTime,
        },
      });

      const updated = await awaitItemState(item.id, (i) =>
        approxEqual(
          i.dueDate,
          new Date(new Date(i.createdAt).getTime() + newResponseTime),
        ),
      );
      expect(updated.tagIds).toEqual([tagId]);
    });

    it("should recompute due date for attention item when message tags list changed (immediate -> immediate)", async () => {
      const tagA = await createTag({
        type: "immediately",
        responseTimeMillis: 30 * 60 * 1000,
      });
      const tagB = await createTag({
        type: "immediately",
        responseTimeMillis: 10 * 60 * 1000,
      });
      const msgId = await sendTaggedMessage("hi", [tagA]);
      const item = await awaitItem((i) => messageIdOf(i) === msgId);

      await reTagMessage(msgId, [tagB]);

      const updated = await awaitItemState(
        item.id,
        (i) =>
          i.tagIds.length === 1 &&
          i.tagIds[0] === tagB &&
          approxEqual(
            i.dueDate,
            new Date(new Date(i.createdAt).getTime() + 10 * 60 * 1000),
          ),
      );
      expect(updated.dueSourceEventId).toBeNull();
    });

    it("should recompute due date for attention item when message tags list changed (immediate -> timeblock)", async () => {
      const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const tagA = await createTag({
        type: "immediately",
        responseTimeMillis: 30 * 60 * 1000,
      });
      const tagB = await createTag({ type: "timeblock" });
      const tbId = await createTimeblock({ start, tagIds: [tagB] });
      const msgId = await sendTaggedMessage("hi", [tagA]);
      const item = await awaitItem((i) => messageIdOf(i) === msgId);

      await reTagMessage(msgId, [tagB]);

      const updated = await awaitItemState(
        item.id,
        (i) =>
          i.tagIds.length === 1 &&
          i.tagIds[0] === tagB &&
          approxEqual(i.dueDate, start),
      );
      expect(updated.dueSourceEventId).toBe(tbId);
    });

    it("should remove due date for attention item when associated timeblock is moved in the past", async () => {
      const start = new Date(Date.now() + 60 * 60 * 1000);
      const tagId = await createTag({ type: "timeblock" });
      const tbId = await createTimeblock({ start, tagIds: [tagId] });
      const msgId = await sendTaggedMessage("hi", [tagId]);
      const item = await awaitItem(
        (i) =>
          messageIdOf(i) === msgId && i.dueSourceEventId === tbId,
      );

      const past = new Date(Date.now() - 60 * 60 * 1000);
      await updateTimeblock(tbId, {
        start: isoNoMillis(past),
        timezone: "UTC",
      });

      const updated = await awaitItemState(item.id, (i) => i.dueDate === null);
      expect(updated.dueSourceEventId).toBeNull();
    });

    it("should remove due date for attention item when tag for messages are removed from associated timeblock", async () => {
      const start = new Date(Date.now() + 60 * 60 * 1000);
      const tagId = await createTag({ type: "timeblock" });
      const tbId = await createTimeblock({ start, tagIds: [tagId] });
      const msgId = await sendTaggedMessage("hi", [tagId]);
      const item = await awaitItem(
        (i) =>
          messageIdOf(i) === msgId && i.dueSourceEventId === tbId,
      );

      await updateTimeblock(tbId, { tagIds: [] });

      const updated = await awaitItemState(item.id, (i) => i.dueDate === null);
      expect(updated.dueSourceEventId).toBeNull();
    });

    it("should recompute due date for attention item when associated timeblock is moved but still in the future", async () => {
      const start = new Date(Date.now() + 60 * 60 * 1000);
      const tagId = await createTag({ type: "timeblock" });
      const tbId = await createTimeblock({ start, tagIds: [tagId] });
      const msgId = await sendTaggedMessage("hi", [tagId]);
      const item = await awaitItem(
        (i) =>
          messageIdOf(i) === msgId && i.dueSourceEventId === tbId,
      );

      const newStart = new Date(Date.now() + 3 * 60 * 60 * 1000);
      await updateTimeblock(tbId, {
        start: isoNoMillis(newStart),
        timezone: "UTC",
      });

      const updated = await awaitItemState(item.id, (i) =>
        approxEqual(i.dueDate, newStart),
      );
      expect(updated.dueSourceEventId).toBe(tbId);
    });

    it("should recompute due date for attention item when multiple timeblocks in the future associated with the same tag and earliest timeblock gets tag list removed", async () => {
      const startA = new Date(Date.now() + 60 * 60 * 1000);
      const startB = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const tagId = await createTag({ type: "timeblock" });
      const tbA = await createTimeblock({ start: startA, tagIds: [tagId] });
      const tbB = await createTimeblock({ start: startB, tagIds: [tagId] });
      const msgId = await sendTaggedMessage("hi", [tagId]);
      const item = await awaitItem(
        (i) =>
          messageIdOf(i) === msgId && i.dueSourceEventId === tbA,
      );

      await updateTimeblock(tbA, { tagIds: [] });

      const updated = await awaitItemState(
        item.id,
        (i) =>
          i.dueSourceEventId === tbB && approxEqual(i.dueDate, startB),
      );
      expect(updated.dueDate).not.toBeNull();
    });

    it("should recompute due date for attention item when multiple timeblocks in the future associated with the same tag and earliest timeblock gets tag list updated with different tags", async () => {
      const startA = new Date(Date.now() + 60 * 60 * 1000);
      const startB = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const tagId = await createTag({ type: "timeblock" });
      const otherTagId = await createTag({ type: "timeblock" });
      const tbA = await createTimeblock({ start: startA, tagIds: [tagId] });
      const tbB = await createTimeblock({ start: startB, tagIds: [tagId] });
      const msgId = await sendTaggedMessage("hi", [tagId]);
      const item = await awaitItem(
        (i) =>
          messageIdOf(i) === msgId && i.dueSourceEventId === tbA,
      );

      await updateTimeblock(tbA, { tagIds: [otherTagId] });

      const updated = await awaitItemState(
        item.id,
        (i) =>
          i.dueSourceEventId === tbB && approxEqual(i.dueDate, startB),
      );
      expect(updated.dueDate).not.toBeNull();
      expect(updated.dueDate).toBe(isoToTruncatedMillis(startB));
    });

    it("should recompute due date for attention item when multiple timeblocks in the future associated with the same tag and earliest timeblock gets deleted", async () => {
      const startA = new Date(Date.now() + 60 * 60 * 1000);
      const startB = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const tagId = await createTag({ type: "timeblock" });
      const tbA = await createTimeblock({ start: startA, tagIds: [tagId] });
      const tbB = await createTimeblock({ start: startB, tagIds: [tagId] });
      const msgId = await sendTaggedMessage("hi", [tagId]);

      const item = await awaitItem(
        (i) =>
          messageIdOf(i) === msgId && i.dueSourceEventId === tbA,
      );

      await deleteTimeblock(tbA);

      const updated = await awaitItemState(
        item.id,
        (i) =>
          i.dueSourceEventId === tbB && approxEqual(i.dueDate, startB),
      );

      expect(updated.dueDate).not.toBeNull();
      expect(updated.dueDate).toBe(isoToTruncatedMillis(startB));
    });

    describe("recurring timeblocks", () => {
      const DAY = 24 * 60 * 60 * 1000;
      // Series started yesterday; its first instance is over, the next one
      // starts in ~1h.
      const seriesStart = () =>
        new Date(Date.parse(isoNoMillis(new Date(Date.now() - 23 * 3600_000))));

      it("should set due date to the next upcoming occurrence of a recurring timeblock", async () => {
        const start = seriesStart();
        const tagId = await createTag({ type: "timeblock" });
        const tbId = await createTimeblock({
          start,
          tagIds: [tagId],
          rrule: "FREQ=DAILY",
        });
        const msgId = await sendTaggedMessage("hi", [tagId]);

        const item = await awaitItem(
          (i) =>
            messageIdOf(i) === msgId && i.dueSourceEventId === tbId,
        );
        expect(item.dueDate).toBe(
          isoToTruncatedMillis(new Date(start.getTime() + DAY)),
        );
      });

      it("should skip a cancelled occurrence (exception) of a recurring timeblock", async () => {
        const start = seriesStart();
        const tagId = await createTag({ type: "timeblock" });
        const tbId = await createTimeblock({
          start,
          tagIds: [tagId],
          rrule: "FREQ=DAILY",
        });
        await request(app.getHttpServer())
          .post(`/calendar-events/${tbId}/exceptions`)
          .set("x-test-user-id", recipient.id)
          .send({
            occurrenceStart: isoNoMillis(
              new Date(start.getTime() + DAY),
            ).replace("Z", "+00:00"),
          })
          .expect(204);
        const msgId = await sendTaggedMessage("hi", [tagId]);

        const item = await awaitItem(
          (i) =>
            messageIdOf(i) === msgId && i.dueSourceEventId === tbId,
        );
        expect(item.dueDate).toBe(
          isoToTruncatedMillis(new Date(start.getTime() + 2 * DAY)),
        );
      });
    });
  });

  describe("status flows one way (message → attention item)", () => {
    function immediateTag(): Promise<string> {
      return createTag({ type: "immediately", responseTimeMillis: 60 * 1000 });
    }

    it("sets managed_status on tagged messages and leaves untagged ones unmanaged", async () => {
      const tagId = await immediateTag();
      const taggedId = await sendTaggedMessage("tagged", [tagId]);
      const untagged = await messagingService.send(
        userActorOf(sender.id),
        sendInput(threadId, "plain", []),
      );

      expect(await getMessageManaged(taggedId)).toEqual({
        type: "tagged_message",
        status: "created",
      });
      expect(await getMessageManaged(untagged.id)).toBeNull();
    });

    it("the recipient resolving the message resolves the linked attention item", async () => {
      const tagId = await immediateTag();
      const msgId = await sendTaggedMessage("resolve me", [tagId]);
      const item = await awaitItem((i) => messageIdOf(i) === msgId);

      await messagingService.updateManagedStatus(
        userActorOf(recipient.id),
        msgId,
        "resolved",
      );

      expect((await getMessageManaged(msgId))?.status).toBe("resolved");
      await awaitItemState(item.id, (i) => i.status === "resolved");
    });

    it("rejects a non-recipient (the sender) resolving the message", async () => {
      const tagId = await immediateTag();
      const msgId = await sendTaggedMessage("mine", [tagId]);
      await awaitItem((i) => messageIdOf(i) === msgId);

      await expect(
        messagingService.updateManagedStatus(
          userActorOf(sender.id),
          msgId,
          "resolved",
        ),
      ).rejects.toThrow();
    });

    it("rejects managing status on an untagged (unmanaged) message", async () => {
      const msg = await messagingService.send(
        userActorOf(sender.id),
        sendInput(threadId, "plain", []),
      );

      await expect(
        messagingService.updateManagedStatus(
          userActorOf(recipient.id),
          msg.id,
          "resolved",
        ),
      ).rejects.toThrow();
    });

    it("tracks managed_status across re-tagging (gains on tag, drops on untag)", async () => {
      const tagId = await immediateTag();
      const msg = await messagingService.send(
        userActorOf(sender.id),
        sendInput(threadId, "plain", []),
      );
      expect(await getMessageManaged(msg.id)).toBeNull();

      await messagingService.tagMessage(userActorOf(sender.id), msg.id, [
        tagId,
      ]);
      expect(await getMessageManaged(msg.id)).toEqual({
        type: "tagged_message",
        status: "created",
      });

      await messagingService.tagMessage(userActorOf(sender.id), msg.id, []);
      expect(await getMessageManaged(msg.id)).toBeNull();
    });

    it("has no PATCH: the inbox cannot write an item", async () => {
      const tagId = await immediateTag();
      const msgId = await sendTaggedMessage("no patch", [tagId]);
      const item = await awaitItem((i) => messageIdOf(i) === msgId);

      await request(app.getHttpServer())
        .patch(`/attention-items/${item.id}`)
        .set("x-test-user-id", recipient.id)
        .send({ status: "resolved" })
        .expect(404);
    });
  });

  describe("user delete is permanent", () => {
    function immediateTag(): Promise<string> {
      return createTag({ type: "immediately", responseTimeMillis: 60 * 1000 });
    }

    it("tombstones the item on DELETE", async () => {
      const tagId = await immediateTag();
      const msgId = await sendTaggedMessage("bye", [tagId]);
      const item = await awaitItem((i) => messageIdOf(i) === msgId);

      await deleteItem(item.id);

      expect((await getItems()).some((i) => i.id === item.id)).toBe(false);
      expect((await getItemRow(item.id))?.deletedAt).not.toBeNull();
      await request(app.getHttpServer())
        .get(`/attention-items/${item.id}`)
        .set("x-test-user-id", recipient.id)
        .expect(404);
    });

    it("a later source upsert does not revive a deleted item", async () => {
      const tagA = await immediateTag();
      const tagB = await immediateTag();
      const msgId = await sendTaggedMessage("sticky", [tagA]);
      const item = await awaitItem((i) => messageIdOf(i) === msgId);

      await deleteItem(item.id);
      await reTagMessage(msgId, [tagB]);
      await resolveMessage(msgId);
      await settle();

      expect((await getItems()).some((i) => messageIdOf(i) === msgId)).toBe(
        false,
      );
      const row = await getItemRow(item.id);
      expect(row?.deletedAt).not.toBeNull();
    });

    it("untag → retag after a user delete does not revive the item", async () => {
      const tagId = await immediateTag();
      const msgId = await sendTaggedMessage("untag retag", [tagId]);
      const item = await awaitItem((i) => messageIdOf(i) === msgId);

      await deleteItem(item.id);
      await reTagMessage(msgId, []);
      await reTagMessage(msgId, [tagId]);
      await settle();

      expect((await getItems()).some((i) => messageIdOf(i) === msgId)).toBe(
        false,
      );
      // The tombstone survives the removal and blocks the re-create.
      expect((await getItemRow(item.id))?.deletedAt).not.toBeNull();
    });

    it("untag → retag without a user delete re-creates the item", async () => {
      const tagId = await immediateTag();
      const msgId = await sendTaggedMessage("retag", [tagId]);
      const item = await awaitItem((i) => messageIdOf(i) === msgId);

      await reTagMessage(msgId, []);
      await awaitNoItem((i) => messageIdOf(i) === msgId);
      await reTagMessage(msgId, [tagId]);

      const recreated = await awaitItem((i) => messageIdOf(i) === msgId);
      expect(recreated.id).not.toBe(item.id);
    });
  });

  describe("thread list facts via sharing/network ports", () => {
    it("lists threads with guest, link and connection facts", async () => {
      const listThreads = async () =>
        (
          await request(app.getHttpServer())
            .get("/threads")
            .set("x-test-user-id", recipient.id)
            .expect(200)
        ).body as Array<{
          threadId: string;
          frozen: boolean;
          other: Record<string, unknown>;
        }>;

      const threads = await listThreads();
      const userThread = threads.find((t) => t.threadId === threadId)!;
      const guestThread = threads.find((t) => t.threadId === guestThreadId)!;

      expect(userThread.other).toMatchObject({
        kind: "user",
        userId: sender.id,
        isActiveConnection: true,
      });
      expect(userThread.frozen).toBe(false);
      expect(guestThread.other).toMatchObject({
        kind: "guest",
        guestId: guest.id,
        displayName: "Guest",
        publicViewId,
        publicViewExpired: false,
      });
      expect(guestThread.frozen).toBe(false);

      await db
        .update(publicViews)
        .set({ revokedAt: new Date() })
        .where(eq(publicViews.id, publicViewId));
      try {
        const after = await listThreads();
        expect(after.find((t) => t.threadId === guestThreadId)!.frozen).toBe(
          true,
        );
      } finally {
        await db
          .update(publicViews)
          .set({ revokedAt: null })
          .where(eq(publicViews.id, publicViewId));
      }
    });
  });
});
