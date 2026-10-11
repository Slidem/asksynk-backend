import "reflect-metadata";

import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import * as dotenv from "dotenv";
import { eq } from "drizzle-orm";
import * as path from "path";

import { GuestIdentityModule } from "@/api/auth/guest-identity.module";
import { generateId } from "@/api/kernel/id";
import { DB_CLIENT_PROVIDER, DbModule } from "@/api/platform/db/db.module";
import { TxModule } from "@/api/platform/db/tx.module";
import { GuestMessageCountHandler } from "@/api/sharing/presentation/events/guest-message-count.handler";
import { SharingModule } from "@/api/sharing/sharing.module";
import { publicViewGuests, publicViews } from "@/migrations/schema/publicViews";
import { users } from "@/migrations/schema/users";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

// Handler driven directly (no dispatcher): parallel suites share the outbox.
describe("GuestMessageCountHandler (integration)", () => {
  let module: TestingModule;
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let handler: GuestMessageCountHandler;
  const ownerId = generateId();
  const publicViewId = generateId();
  const guestId = generateId();

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: path.resolve(__dirname, "../../.env.test"),
        }),
        DbModule,
        TxModule,
        GuestIdentityModule,
        SharingModule,
      ],
    }).compile();
    await module.init();

    db = module.get(DB_CLIENT_PROVIDER);
    handler = module.get(GuestMessageCountHandler);

    const expiresAt = new Date(Date.now() + 24 * 3600_000);
    await db.insert(users).values({
      id: ownerId,
      email: `${ownerId}@test.example`,
      name: "Owner",
      emailVerified: true,
    });
    await db.insert(publicViews).values({
      id: publicViewId,
      ownerUserId: ownerId,
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
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, ownerId));
    await module.close();
  });

  const messageCreated = (
    messageId: string,
    sender: { kind: "user" | "guest"; id: string },
  ) => ({
    threadId: generateId(),
    message: {
      id: messageId,
      threadId: generateId(),
      parentMessageId: null,
      senderKind: sender.kind,
      senderId: sender.id,
      body: "hi",
      createdAt: new Date().toISOString(),
    },
    sentToUserId: ownerId,
  });

  const messageCount = async (): Promise<number> => {
    const [row] = await db
      .select({ count: publicViewGuests.messageCount })
      .from(publicViewGuests)
      .where(eq(publicViewGuests.id, guestId));
    return row.count;
  };

  it("counts each guest message once, ignoring redelivery and user messages", async () => {
    const first = generateId();
    const second = generateId();

    await handler.onMessageCreated(
      messageCreated(first, { kind: "guest", id: guestId }),
    );
    await handler.onMessageCreated(
      messageCreated(first, { kind: "guest", id: guestId }),
    );
    await handler.onMessageCreated(
      messageCreated(generateId(), { kind: "user", id: ownerId }),
    );
    await handler.onMessageCreated(
      messageCreated(second, { kind: "guest", id: guestId }),
    );
    // A stale redelivery of an already-counted message.
    await handler.onMessageCreated(
      messageCreated(first, { kind: "guest", id: guestId }),
    );

    expect(await messageCount()).toBe(2);
  });
});
