import "reflect-metadata";

import { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { and, eq, sql } from "drizzle-orm";
import * as path from "path";

import { MessagingService } from "@/api/conversations/application/messaging.service";
import { ConversationsModule } from "@/api/conversations/conversations.module";
import { ERROR_CATALOGUES } from "@/api/error-catalogs.root";
import { EventsModule } from "@/api/events/events.module";
import { generateId } from "@/api/kernel/id";
import { ClockModule } from "@/api/platform/clock/clock.module";
import { DB_CLIENT_PROVIDER, DbModule } from "@/api/platform/db/db.module";
import { TxModule } from "@/api/platform/db/tx.module";
import { ErrorsModule } from "@/api/platform/errors/errors.module";
import { MessageManagedStatusChanged } from "@/api/platform/events/registry/events.registry";
import { guestActor } from "@/api/platform/http/auth/actor.mapper";
import { AuthGuest } from "@/api/platform/http/auth/auth.types";
import {
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
import { NoopRealtimeModule } from "@/test/helpers/noopRealtimeModule";

/**
 * MessagingService behavior for users and guests (roadmap 4.3: written against the old
 * user/guest method pairs, kept green across the collapse onto `Actor`).
 */
describe("MessagingService (integration)", () => {
  let app: INestApplication;
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let messaging: MessagingService;

  // a ↔ b connected (thread ab); c is a stranger; a ↔ d share a thread but are no
  // longer connected (frozen). b owns a public view with a guest (guest thread).
  const a = generateId();
  const b = generateId();
  const c = generateId();
  const d = generateId();
  let threadAb: string;
  let threadAd: string;
  let tagOfA: string;
  let tagOfB: string;
  let guest: AuthGuest;

  async function insertTag(userId: string): Promise<string> {
    const id = generateId();
    await db
      .insert(tagsTable)
      .values({ id, userId, name: `tag-${id}`, color: "#000000" });
    return id;
  }

  async function insertThread(
    participants: { userId: string | null; guestId: string | null }[],
    publicViewId: string | null = null,
  ): Promise<string> {
    const id = generateId();
    await db.insert(messageThreads).values({ id, publicViewId });
    await db
      .insert(threadParticipants)
      .values(participants.map((p) => ({ threadId: id, ...p })));
    return id;
  }

  async function insertUsers(n: number): Promise<string[]> {
    const ids = Array.from({ length: n }, () => generateId());
    await db.insert(users).values(
      ids.map((id) => ({
        id,
        email: `${id}@test.example`,
        name: "Test User",
        emailVerified: true,
      })),
    );
    return ids;
  }

  async function connect(x: string, y: string): Promise<void> {
    await db.insert(userNetwork).values([
      { userId: x, connectionId: y },
      { userId: y, connectionId: x },
    ]);
  }

  async function insertGuest(
    ownerUserId: string,
    linkLive = true,
  ): Promise<AuthGuest> {
    const publicViewId = generateId();
    const guestId = generateId();
    const expiresAt = new Date(
      Date.now() + (linkLive ? 1 : -1) * 24 * 60 * 60 * 1000,
    );
    await db.insert(publicViews).values({
      id: publicViewId,
      ownerUserId,
      slug: `slug-${publicViewId}`,
      expiresAt,
    });
    await db.insert(publicViewGuests).values({
      id: guestId,
      publicViewId,
      displayName: "Guest",
      tokenHash: `token-${guestId}`,
      expiresAt,
    });
    return {
      id: guestId,
      publicViewId,
      ownerUserId,
      displayName: "Guest",
      expiresAt,
    };
  }

  async function statusEventsFor(messageId: string): Promise<number> {
    const rows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(eventsOutbox)
      .where(
        and(
          eq(eventsOutbox.eventType, MessageManagedStatusChanged.name),
          sql`${eventsOutbox.payload}->>'messageId' = ${messageId}`,
        ),
      );
    return rows[0].n;
  }

  beforeAll(async () => {
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
        ClockModule,
        ConversationsModule,
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    db = module.get(DB_CLIENT_PROVIDER);
    messaging = module.get(MessagingService);

    await db.insert(users).values(
      [a, b, c, d].map((id) => ({
        id,
        email: `${id}@test.example`,
        name: "Test User",
        emailVerified: true,
      })),
    );
    await db.insert(userNetwork).values([
      { userId: a, connectionId: b },
      { userId: b, connectionId: a },
    ]);

    threadAb = await insertThread([
      { userId: a, guestId: null },
      { userId: b, guestId: null },
    ]);
    threadAd = await insertThread([
      { userId: a, guestId: null },
      { userId: d, guestId: null },
    ]);
    tagOfA = await insertTag(a);
    tagOfB = await insertTag(b);
    guest = await insertGuest(b);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("send (user)", () => {
    it("sends to a participant thread; tags are the recipient's", async () => {
      const m = await messaging.send(
        userActorOf(a),
        sendInput(threadAb, "hi", [tagOfB]),
      );

      expect(m.threadId).toBe(threadAb);
      expect(m.sender).toEqual({ kind: "user", userId: a });
      expect(m.tagIds).toEqual([tagOfB]);
      expect(m.managedStatus).toEqual({
        type: "tagged_message",
        status: "created",
      });
    });

    it("untagged message is not managed", async () => {
      const m = await messaging.send(
        userActorOf(a),
        sendInput(threadAb, "hi", []),
      );
      expect(m.managedStatus).toBeNull();
    });

    it("rejects the sender's own tags", async () => {
      await expect(
        messaging.send(userActorOf(a), sendInput(threadAb, "hi", [tagOfA])),
      ).rejects.toMatchObject({ code: "tags.tags_not_found" });
    });

    it("non-participant → thread_not_found", async () => {
      await expect(
        messaging.send(userActorOf(c), sendInput(threadAb, "hi", [])),
      ).rejects.toMatchObject({ code: "messaging.thread_not_found" });
    });

    it("unknown thread → thread_not_found", async () => {
      await expect(
        messaging.send(userActorOf(a), sendInput(generateId(), "hi", [])),
      ).rejects.toMatchObject({ code: "messaging.thread_not_found" });
    });

    it("disconnected users → thread_is_frozen", async () => {
      await expect(
        messaging.send(userActorOf(a), sendInput(threadAd, "hi", [])),
      ).rejects.toMatchObject({ code: "messaging.thread_is_frozen" });
    });

    it("replies to a top-level message; not to a reply", async () => {
      const parent = await messaging.send(
        userActorOf(a),
        sendInput(threadAb, "p", []),
      );
      const reply = await messaging.send(
        userActorOf(b),
        sendInput(threadAb, "r", [], parent.id),
      );
      expect(reply.parentMessageId).toBe(parent.id);

      await expect(
        messaging.send(userActorOf(a), sendInput(threadAb, "rr", [], reply.id)),
      ).rejects.toMatchObject({ code: "messaging.cannot_reply_to_message" });
    });

    it("reply parent from another thread → message_not_found_for_thread", async () => {
      const other = await messaging.send(
        guestActor(guest),
        sendInput(null, "g", []),
      );
      await expect(
        messaging.send(userActorOf(a), sendInput(threadAb, "r", [], other.id)),
      ).rejects.toMatchObject({
        code: "messaging.message_not_found_for_thread",
      });
    });

    it("rejects attachments the sender can't use", async () => {
      await expect(
        messaging.send(
          userActorOf(a),
          sendInput(threadAb, "hi", [], null, [generateId()]),
        ),
      ).rejects.toMatchObject({ code: "storage.attachment_not_usable" });
    });

    it("inline task suggestion creates a suggestion for the other user", async () => {
      const m = await messaging.send(
        userActorOf(a),
        sendInput(threadAb, "do it", [], null, [], {
          kind: "task",
          title: "Do it",
          description: null,
          dueDate: null,
          tagIds: [],
          tasks: [],
        }),
      );
      expect(m.suggestionId).toEqual(expect.any(String));
    });

    it("user without threadId → thread_id_required", async () => {
      await expect(
        messaging.send(userActorOf(a), sendInput(null, "hi")),
      ).rejects.toMatchObject({
        code: "messaging.thread_id_required",
        message: "threadId required",
      });
    });
  });

  describe("send (guest)", () => {
    it("first message creates the guest thread (owner + guest); tags are the owner's", async () => {
      const g = await insertGuest(b);

      const first = await messaging.send(
        guestActor(g),
        sendInput(null, "hello", [tagOfB]),
      );
      const second = await messaging.send(
        guestActor(g),
        sendInput(null, "again", []),
      );

      expect(first.sender).toEqual({ kind: "guest", guestId: g.id });
      expect(first.tagIds).toEqual([tagOfB]);
      expect(second.threadId).toBe(first.threadId);

      const participants = await db
        .select()
        .from(threadParticipants)
        .where(eq(threadParticipants.threadId, first.threadId));
      expect(
        participants.map((p) => ({ userId: p.userId, guestId: p.guestId })),
      ).toEqual(
        expect.arrayContaining([
          { userId: b, guestId: null },
          { userId: null, guestId: g.id },
        ]),
      );
    });

    it("guest cannot attach files", async () => {
      await expect(
        messaging.send(
          guestActor(guest),
          sendInput(null, "hi", [], null, [generateId()]),
        ),
      ).rejects.toMatchObject({
        code: "messaging.guest_cannot_attach_files",
        message: "Guests cannot attach files",
      });
    });

    it("guest cannot suggest tasks", async () => {
      await expect(
        messaging.send(
          guestActor(guest),
          sendInput(null, "hi", [], null, [], {
            kind: "task",
            title: "t",
            description: null,
            dueDate: null,
            tagIds: [],
            tasks: [],
          }),
        ),
      ).rejects.toMatchObject({
        code: "messaging.guest_cannot_suggest_tasks",
        message: "Guests cannot suggest tasks",
      });
    });

    it("rejects tags not owned by the owner", async () => {
      await expect(
        messaging.send(guestActor(guest), sendInput(null, "hi", [tagOfA])),
      ).rejects.toMatchObject({ code: "tags.tags_not_found" });
    });
  });

  describe("tagMessage", () => {
    it("participant re-tags with the recipient's tags; managed status follows", async () => {
      const m = await messaging.send(
        userActorOf(a),
        sendInput(threadAb, "hi", []),
      );

      const tagged = await messaging.tagMessage(userActorOf(b), m.id, [tagOfB]);
      expect(tagged.tagIds).toEqual([tagOfB]);
      expect(tagged.managedStatus?.status).toBe("created");

      const untagged = await messaging.tagMessage(userActorOf(b), m.id, []);
      expect(untagged.managedStatus).toBeNull();
    });

    it("non-participant → thread_not_found", async () => {
      const m = await messaging.send(
        userActorOf(a),
        sendInput(threadAb, "hi", []),
      );
      await expect(
        messaging.tagMessage(userActorOf(c), m.id, [tagOfB]),
      ).rejects.toMatchObject({ code: "messaging.thread_not_found" });
    });

    it("unknown message → message_not_found", async () => {
      await expect(
        messaging.tagMessage(userActorOf(a), generateId(), []),
      ).rejects.toMatchObject({ code: "messaging.message_not_found" });
    });

    it("guest re-tags own message with the owner's tags", async () => {
      const m = await messaging.send(
        guestActor(guest),
        sendInput(null, "hi", []),
      );
      const tagged = await messaging.tagMessage(guestActor(guest), m.id, [
        tagOfB,
      ]);
      expect(tagged.tagIds).toEqual([tagOfB]);
    });

    it("guest cannot tag the owner's message", async () => {
      await messaging.send(guestActor(guest), sendInput(null, "open", []));
      const guestThread = await db
        .select({ threadId: threadParticipants.threadId })
        .from(threadParticipants)
        .where(eq(threadParticipants.guestId, guest.id));
      const ownerMsg = await messaging.send(
        userActorOf(b),
        sendInput(guestThread[0].threadId, "owner", []),
      );

      await expect(
        messaging.tagMessage(guestActor(guest), ownerMsg.id, [tagOfB]),
      ).rejects.toMatchObject({ code: "messaging.cannot_tag_message" });
    });

    it("guest cannot tag a message outside their thread", async () => {
      const m = await messaging.send(
        userActorOf(a),
        sendInput(threadAb, "hi", []),
      );
      await expect(
        messaging.tagMessage(guestActor(guest), m.id, [tagOfB]),
      ).rejects.toMatchObject({ code: "messaging.thread_not_found" });
    });
  });

  describe("updateManagedStatus", () => {
    it("recipient updates; same status again is a no-op without event", async () => {
      const m = await messaging.send(
        userActorOf(a),
        sendInput(threadAb, "hi", [tagOfB]),
      );

      const updated = await messaging.updateManagedStatus(
        userActorOf(b),
        m.id,
        "resolved",
      );
      expect(updated.managedStatus?.status).toBe("resolved");
      expect(await statusEventsFor(m.id)).toBe(1);

      await messaging.updateManagedStatus(userActorOf(b), m.id, "resolved");
      expect(await statusEventsFor(m.id)).toBe(1);
    });

    it("sender cannot update their own message", async () => {
      const m = await messaging.send(
        userActorOf(a),
        sendInput(threadAb, "hi", [tagOfB]),
      );
      await expect(
        messaging.updateManagedStatus(userActorOf(a), m.id, "resolved"),
      ).rejects.toMatchObject({ code: "messaging.cannot_update_message" });
    });

    it("unmanaged message → cannot_update_message", async () => {
      const m = await messaging.send(
        userActorOf(a),
        sendInput(threadAb, "hi", []),
      );
      await expect(
        messaging.updateManagedStatus(userActorOf(b), m.id, "resolved"),
      ).rejects.toMatchObject({ code: "messaging.cannot_update_message" });
    });

    it("guest → forbidden", async () => {
      const m = await messaging.send(
        guestActor(guest),
        sendInput(null, "hi", [tagOfB]),
      );
      await expect(
        messaging.updateManagedStatus(guestActor(guest), m.id, "resolved"),
      ).rejects.toMatchObject({
        code: "messaging.guest_cannot_update_status",
        message: "forbidden",
      });
    });

    it("non-participant → thread_not_found", async () => {
      const m = await messaging.send(
        userActorOf(a),
        sendInput(threadAb, "hi", [tagOfB]),
      );
      await expect(
        messaging.updateManagedStatus(userActorOf(c), m.id, "resolved"),
      ).rejects.toMatchObject({ code: "messaging.thread_not_found" });
    });
  });

  describe("reads", () => {
    it("user non-participant → thread_not_found", async () => {
      const opts = {};
      await expect(
        messaging.listMessages(userActorOf(c), threadAb, opts),
      ).rejects.toMatchObject({ code: "messaging.thread_not_found" });
      await expect(
        messaging.getThreadStats(userActorOf(c), threadAb),
      ).rejects.toMatchObject({ code: "messaging.thread_not_found" });
      await expect(
        messaging.listTaggedMessages(userActorOf(c), threadAb),
      ).rejects.toMatchObject({ code: "messaging.thread_not_found" });
    });

    it("user participant lists messages, replies, tagged, stats", async () => {
      const parent = await messaging.send(
        userActorOf(a),
        sendInput(threadAb, "p", [tagOfB]),
      );
      const reply = await messaging.send(
        userActorOf(b),
        sendInput(threadAb, "r", [], parent.id),
      );

      const list = await messaging.listMessages(userActorOf(a), threadAb, {});
      expect(list.map((i) => i.message.id)).toContain(parent.id);

      const replies = await messaging.listReplies(
        userActorOf(a),
        threadAb,
        parent.id,
        {},
      );
      expect(replies.map((r) => r.id)).toEqual([reply.id]);

      const tagged = await messaging.listTaggedMessages(
        userActorOf(a),
        threadAb,
      );
      expect(tagged.map((i) => i.message.id)).toContain(parent.id);

      const stats = await messaging.getThreadStats(userActorOf(a), threadAb);
      expect(stats.created).toBeGreaterThanOrEqual(1);
    });

    it("guest without a thread → empty / zero / message_not_found_for_thread", async () => {
      const g = await insertGuest(b);

      expect(await messaging.listMessages(guestActor(g), null, {})).toEqual([]);
      expect(await messaging.listTaggedMessages(guestActor(g), null)).toEqual(
        [],
      );
      expect(await messaging.getThreadStats(guestActor(g), null)).toEqual({
        created: 0,
        inProgress: 0,
        resolved: 0,
      });
      await expect(
        messaging.listReplies(guestActor(g), null, generateId(), {}),
      ).rejects.toMatchObject({
        code: "messaging.message_not_found_for_thread",
      });
    });

    it("guest reads own thread", async () => {
      const g = await insertGuest(b);
      const parent = await messaging.send(
        guestActor(g),
        sendInput(null, "p", [tagOfB]),
      );
      const reply = await messaging.send(
        guestActor(g),
        sendInput(null, "r", [], parent.id),
      );

      const list = await messaging.listMessages(guestActor(g), null, {});
      expect(list.map((i) => i.message.id)).toContain(parent.id);
      expect(
        (await messaging.listReplies(guestActor(g), null, parent.id, {})).map(
          (r) => r.id,
        ),
      ).toEqual([reply.id]);
      expect(
        (await messaging.listTaggedMessages(guestActor(g), null)).map(
          (i) => i.message.id,
        ),
      ).toEqual([parent.id]);
      expect(
        (await messaging.getThreadStats(guestActor(g), null)).created,
      ).toBe(1);
    });
  });

  describe("listThreads", () => {
    it("lists own threads with connection / link liveness; not others'", async () => {
      const [x, y, z] = await insertUsers(3);
      await connect(x, y);
      const xy = await insertThread([
        { userId: x, guestId: null },
        { userId: y, guestId: null },
      ]);
      // x ↔ z share a thread but aren't connected.
      const xz = await insertThread([
        { userId: x, guestId: null },
        { userId: z, guestId: null },
      ]);
      const yz = await insertThread([
        { userId: y, guestId: null },
        { userId: z, guestId: null },
      ]);
      const g = await insertGuest(x, false);
      const xg = await insertThread(
        [
          { userId: x, guestId: null },
          { userId: null, guestId: g.id },
        ],
        g.publicViewId,
      );

      const items = await messaging.listThreads(userActorOf(x));
      const byId = new Map(items.map((i) => [i.thread.id, i]));

      expect([...byId.keys()].sort()).toEqual([xy, xz, xg].sort());
      expect(byId.has(yz)).toBe(false);
      expect(byId.get(xy)!.other).toMatchObject({
        kind: "user",
        userId: y,
        isActiveConnection: true,
      });
      expect(byId.get(xz)!.other).toMatchObject({
        kind: "user",
        userId: z,
        isActiveConnection: false,
      });
      expect(byId.get(xg)!.other).toMatchObject({
        kind: "guest",
        guestId: g.id,
        publicViewId: g.publicViewId,
        publicViewExpired: true,
      });
    });

    it("no threads → []", async () => {
      const [x] = await insertUsers(1);
      expect(await messaging.listThreads(userActorOf(x))).toEqual([]);
    });

    it("guest → guest_cannot_list_threads", async () => {
      await expect(
        messaging.listThreads(guestActor(guest)),
      ).rejects.toMatchObject({ code: "messaging.guest_cannot_list_threads" });
    });
  });

  describe("createOrGetUserThread", () => {
    it("connected pair → new thread with both; second call → same thread", async () => {
      const [x, y] = await insertUsers(2);
      await connect(x, y);

      const thread = await messaging.createOrGetUserThread(userActorOf(x), y);
      expect(await messaging.canAccessThread(userActorOf(x), thread.id)).toBe(
        true,
      );
      expect(await messaging.canAccessThread(userActorOf(y), thread.id)).toBe(
        true,
      );

      const again = await messaging.createOrGetUserThread(userActorOf(y), x);
      expect(again.id).toBe(thread.id);
    });

    it("self → cannot_start_thread", async () => {
      const [x] = await insertUsers(1);
      await expect(
        messaging.createOrGetUserThread(userActorOf(x), x),
      ).rejects.toMatchObject({ code: "messaging.cannot_start_thread" });
    });

    it("guest → cannot_start_thread", async () => {
      await expect(
        messaging.createOrGetUserThread(guestActor(guest), a),
      ).rejects.toMatchObject({ code: "messaging.cannot_start_thread" });
    });

    it("not connected → cannot_start_thread", async () => {
      const [x, y] = await insertUsers(2);
      await expect(
        messaging.createOrGetUserThread(userActorOf(x), y),
      ).rejects.toMatchObject({ code: "messaging.cannot_start_thread" });
    });
  });

  describe("canAccessThread", () => {
    it("user participant / stranger / guest own thread / guest other thread", async () => {
      const g = await insertGuest(b);
      const m = await messaging.send(guestActor(g), sendInput(null, "hi", []));
      const ga = {
        kind: "guest" as const,
        guestId: g.id,
        publicViewId: g.publicViewId,
        ownerUserId: g.ownerUserId,
        displayName: g.displayName,
        expiresAt: g.expiresAt,
      };
      const userActor = (id: string) => ({
        kind: "user" as const,
        userId: id,
        email: `${id}@test.example`,
      });

      expect(await messaging.canAccessThread(userActor(a), threadAb)).toBe(
        true,
      );
      expect(await messaging.canAccessThread(userActor(c), threadAb)).toBe(
        false,
      );
      expect(await messaging.canAccessThread(ga, m.threadId)).toBe(true);
      expect(await messaging.canAccessThread(ga, threadAb)).toBe(false);
    });
  });
});
