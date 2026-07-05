import "reflect-metadata";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import * as dotenv from "dotenv";
import { and, eq, inArray, sql } from "drizzle-orm";
import * as path from "path";
import request from "supertest";

import { AttentionItemsModule } from "@/api/attention-items/attention-items.module";
import { AttentionItemResponse } from "@/api/attention-items/rest/responses/attention-item.response";
import { AuthGuest, AuthUser } from "@/api/auth/auth.types";
import { CalendarEventsModule } from "@/api/calendar-events/calendar-events.module";
import { ClockModule } from "@/api/common/clock/clock.module";
import { EventsModule } from "@/api/events/events.module";
import {
  DB_CLIENT_PROVIDER,
  DbModule,
} from "@/api/infrastructure/db/db.module";
import { TxModule } from "@/api/infrastructure/db/tx.module";
import { MessagingModule } from "@/api/messaging/messaging.module";
import { MessagingService } from "@/api/messaging/services/messaging.service";
import { NetworksModule } from "@/api/networks/networks.module";
import { PublicViewsModule } from "@/api/public-views/public-views.module";
import { StorageModule } from "@/api/storage/storage.module";
import { TagsModule } from "@/api/tags/tags.module";
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
import { generateId } from "@/shared/id";
import { MockAuthGuard } from "@/test/helpers/mockAuthGuard";
import { pollUntil } from "@/test/helpers/pollUntil";
import {
  makeTestUser,
  testUserRegistry,
} from "@/test/helpers/testUserRegistry";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

const POLL_TIMEOUT_MS = 2500;
const ASSERT_TOLERANCE_MS = 5000;

type ImmediateMode = { type: "immediately"; responseTimeMillis: number };
type TimeblockMode = { type: "timeblock" };
type AnswerModeInput = ImmediateMode | TimeblockMode;

interface TaggedMessageMetadata {
  type: "tagged_message";
  messageId: string;
  threadId: string;
  senderId: string;
  senderType: "user" | "guest";
  content: string;
  originalTagIds: string[];
}

function msgMeta(i: AttentionItemResponse): TaggedMessageMetadata {
  return i.metadata as unknown as TaggedMessageMetadata;
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
        }),
        DbModule,
        TxModule,
        EventsModule,
        NetworksModule,
        TagsModule,
        CalendarEventsModule,
        MessagingModule,
        AttentionItemsModule,
        PublicViewsModule,
        ClockModule,
        StorageModule,
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
      token: `token-${guestId}`,
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
    const msg = await messagingService.sendAsUser(
      sender.id,
      threadId,
      body,
      tagIds,
    );
    return msg.id;
  }

  async function reTagMessage(
    messageId: string,
    tagIds: string[],
  ): Promise<void> {
    await messagingService.tagMessage(sender.id, messageId, tagIds);
  }

  async function getItems(): Promise<AttentionItemResponse[]> {
    const res = await request(app.getHttpServer())
      .get("/attention-items")
      .set("x-test-user-id", recipient.id)
      .expect(200);
    return res.body;
  }

  async function updateItemStatus(id: string, status: string): Promise<void> {
    await request(app.getHttpServer())
      .patch(`/attention-items/${id}`)
      .set("x-test-user-id", recipient.id)
      .send({ status: status })
      .expect(200);
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

  async function awaitMessageManagedStatus(
    messageId: string,
    status: string,
  ): Promise<void> {
    await pollUntil(
      () => getMessageManaged(messageId),
      (m) => m?.status === status,
      { timeoutMs: POLL_TIMEOUT_MS },
    );
  }

  async function countOutboxForMessage(
    eventType: string,
    messageId: string,
  ): Promise<number> {
    const rows = await db
      .select({ id: eventsOutbox.id })
      .from(eventsOutbox)
      .where(
        and(
          eq(eventsOutbox.eventType, eventType),
          sql`${eventsOutbox.payload}->>'messageId' = ${messageId}`,
        ),
      );
    return rows.length;
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
        (i) => msgMeta(i).messageId === msgId && i.dueDate !== null,
      );

      expect(approxEqual(item.dueDate, start)).toBe(true);
      expect(item.sourceCalendarEventId).toBe(tbId);
      expect(item.tagIds).toEqual([tagId]);
      expect(item.userId).toBe(recipient.id);
      expect(item.type).toBe("tagged_message");
    });

    it("should create an attention item for the owner from a guest tagged message", async () => {
      const start = new Date(Date.now() + 60 * 60 * 1000);
      const tagId = await createTag({ type: "timeblock" });
      const tbId = await createTimeblock({ start, tagIds: [tagId] });

      const msg = await messagingService.sendAsGuest(guest, "hi from guest", [
        tagId,
      ]);

      const item = await awaitItem(
        (i) => msgMeta(i).messageId === msg.id && i.dueDate !== null,
      );

      expect(item.userId).toBe(recipient.id);
      expect(item.type).toBe("tagged_message");
      expect(msgMeta(item).senderType).toBe("guest");
      expect(msgMeta(item).senderId).toBe(guest.id);
      expect(item.sourceCalendarEventId).toBe(tbId);
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
      const msg = await messagingService.sendAsGuest(guest, "hi", [tagA]);

      const item = await awaitItem((i) => msgMeta(i).messageId === msg.id);
      expect(item.tagIds).toEqual([tagA]);

      await messagingService.tagMessageAsGuest(guest, msg.id, [tagB]);

      await awaitItemState(
        item.id,
        (i) => i.tagIds.length === 1 && i.tagIds[0] === tagB,
      );
    });

    it("should reject a guest tagging with a tag the owner does not own", async () => {
      await expect(
        messagingService.sendAsGuest(guest, "hi", [generateId()]),
      ).rejects.toThrow();
    });

    it("should publish a realtime attention.upserted event identical to the GET response", async () => {
      const tagId = await createTag({
        type: "immediately",
        responseTimeMillis: 30 * 60 * 1000,
      });
      const msgId = await sendTaggedMessage("hello", [tagId]);

      const item = await awaitItem((i) => msgMeta(i).messageId === msgId);

      const { item: emitted } = await awaitOutboxAttentionUpserted(item.id);

      // Payload must match the GET /attention-items shape byte-for-byte.
      expect(emitted).toEqual(item);
      // tagIds populated (empty => client stays silent); metadata.type === item.type.
      expect(emitted.tagIds.length).toBeGreaterThan(0);
      expect(emitted.metadata.type).toBe(emitted.type);
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
        (i) => msgMeta(i).messageId === msgId && i.dueDate !== null,
      );

      expect(approxEqual(item.dueDate, start)).toBe(true);
      expect(item.sourceCalendarEventId).toBe(tbId);
    });

    it("should create new attention item when message is created with immediate tag type", async () => {
      const responseTimeMillis = 30 * 60 * 1000;
      const tagId = await createTag({
        type: "immediately",
        responseTimeMillis,
      });
      const msgId = await sendTaggedMessage("hello", [tagId]);

      const item = await awaitItem(
        (i) => msgMeta(i).messageId === msgId && i.dueDate !== null,
      );

      const expected = new Date(
        new Date(item.createdAt).getTime() + responseTimeMillis,
      );
      expect(approxEqual(item.dueDate, expected)).toBe(true);
      expect(item.sourceCalendarEventId).toBeNull();
      expect(item.tagIds).toEqual([tagId]);
    });

    it("should delete attention item when message is deleted", async () => {
      // No message-delete API exists. Closest analogue per handler: clearing
      // all tags soft-deletes the item. Cover that flow with two starting tags.
      const tagA = await createTag({
        type: "immediately",
        responseTimeMillis: 60 * 1000,
      });
      const tagB = await createTag({
        type: "immediately",
        responseTimeMillis: 60 * 1000,
      });
      const msgId = await sendTaggedMessage("hi", [tagA, tagB]);
      await awaitItem((i) => msgMeta(i).messageId === msgId);

      await reTagMessage(msgId, []);

      await awaitNoItem((i) => msgMeta(i).messageId === msgId);
    });

    it("should delete attention item when message tags are removed", async () => {
      const tagId = await createTag({
        type: "immediately",
        responseTimeMillis: 60 * 1000,
      });
      const msgId = await sendTaggedMessage("hi", [tagId]);
      await awaitItem((i) => msgMeta(i).messageId === msgId);

      await reTagMessage(msgId, []);

      await awaitNoItem((i) => msgMeta(i).messageId === msgId);
    });

    it("should delete attention item when message tags are deleted", async () => {
      const tagId = await createTag({
        type: "timeblock",
      });

      const msgId = await sendTaggedMessage("hi", [tagId]);
      const item = await awaitItem((i) => msgMeta(i).messageId === msgId);

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
      const item = await awaitItem((i) => msgMeta(i).messageId === msgId);

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
      const item = await awaitItem((i) => msgMeta(i).messageId === msgId);
      expect(item.tagIds.sort()).toEqual([tagA, tagB].sort());

      await deleteTag(tagB);

      await awaitItemState(
        item.id,
        (i) => !i.tagIds.includes(tagB) && i.tagIds.includes(tagA),
      );
    });

    it("should not soft-delete resolved attention item when its only tag is deleted", async () => {
      const tagId = await createTag({
        type: "immediately",
        responseTimeMillis: 60 * 1000,
      });
      const msgId = await sendTaggedMessage("hi", [tagId]);
      const item = await awaitItem((i) => msgMeta(i).messageId === msgId);

      await updateItemStatus(item.id, "resolved");

      await deleteTag(tagId);

      // give the handler time to process; then assert item is still present
      await new Promise((r) => setTimeout(r, POLL_TIMEOUT_MS));
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
      const item = await awaitItem((i) => msgMeta(i).messageId === msgId);

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
      const item = await awaitItem((i) => msgMeta(i).messageId === msgId);

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
      expect(updated.sourceCalendarEventId).toBeNull();
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
      const item = await awaitItem((i) => msgMeta(i).messageId === msgId);

      await reTagMessage(msgId, [tagB]);

      const updated = await awaitItemState(
        item.id,
        (i) =>
          i.tagIds.length === 1 &&
          i.tagIds[0] === tagB &&
          approxEqual(i.dueDate, start),
      );
      expect(updated.sourceCalendarEventId).toBe(tbId);
    });

    it("should remove due date for attention item when associated timeblock is moved in the past", async () => {
      const start = new Date(Date.now() + 60 * 60 * 1000);
      const tagId = await createTag({ type: "timeblock" });
      const tbId = await createTimeblock({ start, tagIds: [tagId] });
      const msgId = await sendTaggedMessage("hi", [tagId]);
      const item = await awaitItem(
        (i) =>
          msgMeta(i).messageId === msgId && i.sourceCalendarEventId === tbId,
      );

      const past = new Date(Date.now() - 60 * 60 * 1000);
      await updateTimeblock(tbId, {
        start: isoNoMillis(past),
        timezone: "UTC",
      });

      const updated = await awaitItemState(item.id, (i) => i.dueDate === null);
      expect(updated.sourceCalendarEventId).toBeNull();
    });

    it("should remove due date for attention item when tag for messages are removed from associated timeblock", async () => {
      const start = new Date(Date.now() + 60 * 60 * 1000);
      const tagId = await createTag({ type: "timeblock" });
      const tbId = await createTimeblock({ start, tagIds: [tagId] });
      const msgId = await sendTaggedMessage("hi", [tagId]);
      const item = await awaitItem(
        (i) =>
          msgMeta(i).messageId === msgId && i.sourceCalendarEventId === tbId,
      );

      await updateTimeblock(tbId, { tagIds: [] });

      const updated = await awaitItemState(item.id, (i) => i.dueDate === null);
      expect(updated.sourceCalendarEventId).toBeNull();
    });

    it("should recompute due date for attention item when associated timeblock is moved but still in the future", async () => {
      const start = new Date(Date.now() + 60 * 60 * 1000);
      const tagId = await createTag({ type: "timeblock" });
      const tbId = await createTimeblock({ start, tagIds: [tagId] });
      const msgId = await sendTaggedMessage("hi", [tagId]);
      const item = await awaitItem(
        (i) =>
          msgMeta(i).messageId === msgId && i.sourceCalendarEventId === tbId,
      );

      const newStart = new Date(Date.now() + 3 * 60 * 60 * 1000);
      await updateTimeblock(tbId, {
        start: isoNoMillis(newStart),
        timezone: "UTC",
      });

      const updated = await awaitItemState(item.id, (i) =>
        approxEqual(i.dueDate, newStart),
      );
      expect(updated.sourceCalendarEventId).toBe(tbId);
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
          msgMeta(i).messageId === msgId && i.sourceCalendarEventId === tbA,
      );

      await updateTimeblock(tbA, { tagIds: [] });

      const updated = await awaitItemState(
        item.id,
        (i) =>
          i.sourceCalendarEventId === tbB && approxEqual(i.dueDate, startB),
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
          msgMeta(i).messageId === msgId && i.sourceCalendarEventId === tbA,
      );

      await updateTimeblock(tbA, { tagIds: [otherTagId] });

      const updated = await awaitItemState(
        item.id,
        (i) =>
          i.sourceCalendarEventId === tbB && approxEqual(i.dueDate, startB),
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
          msgMeta(i).messageId === msgId && i.sourceCalendarEventId === tbA,
      );

      await deleteTimeblock(tbA);

      const updated = await awaitItemState(
        item.id,
        (i) =>
          i.sourceCalendarEventId === tbB && approxEqual(i.dueDate, startB),
      );

      expect(updated.dueDate).not.toBeNull();
      expect(updated.dueDate).toBe(isoToTruncatedMillis(startB));
    });
  });

  describe("managed status sync (message <-> attention item)", () => {
    function immediateTag(): Promise<string> {
      return createTag({ type: "immediately", responseTimeMillis: 60 * 1000 });
    }

    it("sets managed_status on tagged messages and leaves untagged ones unmanaged", async () => {
      const tagId = await immediateTag();
      const taggedId = await sendTaggedMessage("tagged", [tagId]);
      const untagged = await messagingService.sendAsUser(
        sender.id,
        threadId,
        "plain",
        [],
      );

      expect(await getMessageManaged(taggedId)).toEqual({
        type: "tagged_message",
        status: "created",
      });
      expect(await getMessageManaged(untagged.id)).toBeNull();
    });

    it("forward: the recipient resolving the message resolves the linked attention item", async () => {
      const tagId = await immediateTag();
      const msgId = await sendTaggedMessage("resolve me", [tagId]);
      const item = await awaitItem((i) => msgMeta(i).messageId === msgId);

      await messagingService.updateManagedStatus(
        recipient.id,
        msgId,
        "resolved",
      );

      expect((await getMessageManaged(msgId))?.status).toBe("resolved");
      await awaitItemState(item.id, (i) => i.status === "resolved");
    });

    it("reverse: resolving the attention item from the inbox resolves the message", async () => {
      const tagId = await immediateTag();
      const msgId = await sendTaggedMessage("inbox resolve", [tagId]);
      const item = await awaitItem((i) => msgMeta(i).messageId === msgId);

      await updateItemStatus(item.id, "resolved");

      await awaitMessageManagedStatus(msgId, "resolved");
    });

    it("rejects a non-recipient (the sender) resolving the message", async () => {
      const tagId = await immediateTag();
      const msgId = await sendTaggedMessage("mine", [tagId]);
      await awaitItem((i) => msgMeta(i).messageId === msgId);

      await expect(
        messagingService.updateManagedStatus(sender.id, msgId, "resolved"),
      ).rejects.toThrow();
    });

    it("rejects managing status on an untagged (unmanaged) message", async () => {
      const msg = await messagingService.sendAsUser(
        sender.id,
        threadId,
        "plain",
        [],
      );

      await expect(
        messagingService.updateManagedStatus(recipient.id, msg.id, "resolved"),
      ).rejects.toThrow();
    });

    it("tracks managed_status across re-tagging (gains on tag, drops on untag)", async () => {
      const tagId = await immediateTag();
      const msg = await messagingService.sendAsUser(
        sender.id,
        threadId,
        "plain",
        [],
      );
      expect(await getMessageManaged(msg.id)).toBeNull();

      await messagingService.tagMessage(sender.id, msg.id, [tagId]);
      expect(await getMessageManaged(msg.id)).toEqual({
        type: "tagged_message",
        status: "created",
      });

      await messagingService.tagMessage(sender.id, msg.id, []);
      expect(await getMessageManaged(msg.id)).toBeNull();
    });

    it("forward sync terminates: one status event, never triggers the reverse event", async () => {
      const tagId = await immediateTag();
      const msgId = await sendTaggedMessage("fwd", [tagId]);
      const item = await awaitItem((i) => msgMeta(i).messageId === msgId);

      await messagingService.updateManagedStatus(
        recipient.id,
        msgId,
        "resolved",
      );
      await awaitItemState(item.id, (i) => i.status === "resolved");

      // Let any (erroneous) follow-on events flush before counting.
      await new Promise((r) => setTimeout(r, POLL_TIMEOUT_MS));

      expect(await countOutboxForMessage("message.status.changed", msgId)).toBe(
        1,
      );
      // The forward path uses syncSourceStatus, which never emits the reverse
      // event — so it cannot loop back onto the message.
      expect(
        await countOutboxForMessage("attention.message.synced", msgId),
      ).toBe(0);
    });

    it("reverse sync terminates: one reverse event, one status event, item stays resolved", async () => {
      const tagId = await immediateTag();
      const msgId = await sendTaggedMessage("rev", [tagId]);
      const item = await awaitItem((i) => msgMeta(i).messageId === msgId);

      await updateItemStatus(item.id, "resolved");
      await awaitMessageManagedStatus(msgId, "resolved");

      await new Promise((r) => setTimeout(r, POLL_TIMEOUT_MS));

      // The inbox PATCH publishes exactly one reverse event...
      expect(
        await countOutboxForMessage("attention.message.synced", msgId),
      ).toBe(1);
      // ...and the message publishes exactly one status event; the durable
      // re-sync no-ops on the idempotency guard, so nothing loops.
      expect(await countOutboxForMessage("message.status.changed", msgId)).toBe(
        1,
      );
      const finalItem = (await getItems()).find((i) => i.id === item.id);
      expect(finalItem?.status).toBe("resolved");
    });
  });
});
