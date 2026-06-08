import "reflect-metadata";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import * as dotenv from "dotenv";
import { inArray } from "drizzle-orm";
import * as path from "path";
import request from "supertest";
import { uuidv7 } from "uuidv7";

import { AuthUser } from "@/api/auth/auth.types";
import { ClockModule } from "@/api/common/clock/clock.module";
import {
  DB_CLIENT_PROVIDER,
  DbModule,
} from "@/api/infrastructure/db/db.module";
import { TxModule } from "@/api/infrastructure/db/tx.module";
import { MessageAttachmentRepository } from "@/api/messaging/attachments/message-attachment.repository";
import { MessageAttachmentResolver } from "@/api/messaging/attachments/message-attachment.resolver";
import { MessagingRepository } from "@/api/messaging/repositories/messaging.repository";
import { StorageModule } from "@/api/storage/storage.module";
import {
  messageAttachments,
  messages,
  messageThreads,
  threadParticipants,
} from "@/migrations/schema/messaging";
import { users } from "@/migrations/schema/users";
import { MockAuthGuard } from "@/test/helpers/mockAuthGuard";
import {
  makeTestUser,
  testUserRegistry,
} from "@/test/helpers/testUserRegistry";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

interface UploadResponse {
  attachmentId: string;
  storageKey: string;
  upload: { url: string; fields: Record<string, string>; expiresAt: string };
}

/**
 * Real Garage integration — requires the test stack:
 *   pnpm test:integration:up
 * Exercises the genuine presigned-POST upload, HEAD-based finalize, and signed GET.
 */
describe("Attachments (integration, real Garage)", () => {
  let app: INestApplication;
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: path.resolve(__dirname, "../../.env.test"),
        }),
        ClockModule,
        DbModule,
        TxModule,
        StorageModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: MockAuthGuard },
        // Just enough of messaging to register the "message" placement resolver.
        MessagingRepository,
        MessageAttachmentRepository,
        MessageAttachmentResolver,
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    // app.init() runs OnModuleInit → MessageAttachmentResolver self-registers.
    await app.init();

    db = module.get(DB_CLIENT_PROVIDER);
  });

  afterAll(async () => {
    if (createdUserIds.length) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    testUserRegistry.clear();
    await app.close();
  });

  async function makeUser(): Promise<AuthUser> {
    const user = makeTestUser();
    testUserRegistry.register(user);
    createdUserIds.push(user.id);
    await db
      .insert(users)
      .values({
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: true,
      })
      .onConflictDoNothing();
    return user;
  }

  function createUpload(userId: string, body: object, expectStatus = 201) {
    return request(app.getHttpServer())
      .post("/attachments")
      .set("x-test-user-id", userId)
      .send(body)
      .expect(expectStatus);
  }

  // Real direct-to-Garage presigned POST upload (fields first, file last).
  async function uploadToStorage(
    upload: UploadResponse["upload"],
    bytes: Buffer,
    contentType: string,
  ): Promise<void> {
    const form = new FormData();
    for (const [k, v] of Object.entries(upload.fields)) form.append(k, v);
    form.append("file", new Blob([bytes], { type: contentType }), "upload.bin");

    const res = await fetch(upload.url, { method: "POST", body: form });
    if (res.status >= 300) {
      throw new Error(`upload failed: ${res.status} ${await res.text()}`);
    }
  }

  async function finalize(userId: string, id: string, expectStatus = 200) {
    return request(app.getHttpServer())
      .patch(`/attachments/${id}`)
      .set("x-test-user-id", userId)
      .send({ status: "ready" })
      .expect(expectStatus);
  }

  it("uploads to Garage, finalizes via HEAD, and serves the bytes via a signed url", async () => {
    const user = await makeUser();
    const bytes = Buffer.from("hello-garage-attachment");

    const created = (
      await createUpload(user.id, {
        placement: "message",
        contentType: "image/png",
        fileName: "pic.png",
        sizeBytes: bytes.length,
      })
    ).body as UploadResponse;
    expect(created.upload.url).toContain("3910");

    await uploadToStorage(created.upload, bytes, "image/png");

    const finalized = await finalize(user.id, created.attachmentId);
    expect(finalized.body.sizeBytes).toBe(bytes.length);
    expect(finalized.body.expiresAt).not.toBeNull();

    const read = await request(app.getHttpServer())
      .get(`/attachments/${created.attachmentId}`)
      .set("x-test-user-id", user.id)
      .expect(200);

    // The signed url really resolves to the uploaded bytes.
    const fetched = await fetch(read.body.url);
    expect(fetched.status).toBe(200);
    expect(Buffer.from(await fetched.arrayBuffer())).toEqual(bytes);
  });

  it("rejects a disallowed content-type at create time", async () => {
    const user = await makeUser();
    await createUpload(
      user.id,
      {
        placement: "message",
        contentType: "application/x-evil",
        sizeBytes: 10,
      },
      400,
    );
  });

  it("rejects a declared size over the limit at create time", async () => {
    const user = await makeUser();
    await createUpload(
      user.id,
      {
        placement: "message",
        contentType: "image/png",
        sizeBytes: 50 * 1024 * 1024,
      },
      400,
    );
  });

  it("lets Garage reject an oversized body via the POST content-length-range", async () => {
    const user = await makeUser();
    const created = (
      await createUpload(user.id, {
        placement: "message",
        contentType: "image/png",
        sizeBytes: 1024,
      })
    ).body as UploadResponse;

    // Body exceeds the 10MB policy cap → storage refuses it.
    const tooBig = Buffer.alloc(11 * 1024 * 1024, 1);
    await expect(
      uploadToStorage(created.upload, tooBig, "image/png"),
    ).rejects.toThrow(/upload failed/);
  });

  it("returns a stable, non-expiring url for public attachments", async () => {
    const user = await makeUser();
    const bytes = Buffer.from("public-bytes");
    const created = (
      await createUpload(user.id, {
        placement: "public",
        contentType: "image/webp",
        sizeBytes: bytes.length,
      })
    ).body as UploadResponse;

    await uploadToStorage(created.upload, bytes, "image/webp");
    await finalize(user.id, created.attachmentId);

    const read = await request(app.getHttpServer())
      .get(`/attachments/${created.attachmentId}`)
      .set("x-test-user-id", user.id)
      .expect(200);
    // Stable host-based web url; expiry is null (cacheable).
    expect(read.body.url).toContain("3912");
    expect(read.body.expiresAt).toBeNull();
  });

  it("authorizes message-attachment reads by thread participation (resolver)", async () => {
    const owner = await makeUser();
    const participant = await makeUser();
    const outsider = await makeUser();
    const bytes = Buffer.from("shared-attachment");

    const created = (
      await createUpload(owner.id, {
        placement: "message",
        contentType: "image/png",
        sizeBytes: bytes.length,
      })
    ).body as UploadResponse;
    await uploadToStorage(created.upload, bytes, "image/png");
    await finalize(owner.id, created.attachmentId);

    // Thread (owner + participant) with a message linking the attachment.
    const threadId = uuidv7();
    const messageId = uuidv7();
    await db
      .insert(messageThreads)
      .values({ id: threadId, publicViewId: null });
    await db.insert(threadParticipants).values([
      { threadId, userId: owner.id, guestId: null },
      { threadId, userId: participant.id, guestId: null },
    ]);
    await db
      .insert(messages)
      .values({ id: messageId, threadId, senderUserId: owner.id, body: "hi" });
    await db
      .insert(messageAttachments)
      .values({ messageId, attachmentId: created.attachmentId, position: 0 });

    // Participant (not the uploader) is allowed via the resolver.
    await request(app.getHttpServer())
      .get(`/attachments/${created.attachmentId}`)
      .set("x-test-user-id", participant.id)
      .expect(200);

    // Outsider is denied.
    await request(app.getHttpServer())
      .get(`/attachments/${created.attachmentId}`)
      .set("x-test-user-id", outsider.id)
      .expect(403);
  });
});
