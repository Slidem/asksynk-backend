import "reflect-metadata";

import * as dotenv from "dotenv";
import * as path from "path";

import { DB_CLIENT_PROVIDER, DbModule } from "@/api/common/db/db.module";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { EventsModule } from "@/api/events/events.module";
import { MockAuthGuard } from "@/api/test/mockAuthGuard";
import { NatsService } from "@/api/common/nats/nats.service";
import { TEST_USER } from "@/api/test/testUser";
import { TxModule } from "@/api/common/db/tx.module";
import { eq } from "drizzle-orm";
import { events } from "@/migrations/schema/events";
import { generateId } from "@/shared/id";
import request from "supertest";
import { users } from "@/migrations/schema/users";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

describe("EventsController (integration)", () => {
  let app: INestApplication;
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: path.resolve(__dirname, "../../.env.test"),
        }),
        DbModule,
        TxModule,
        EventsModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: MockAuthGuard }],
    })
      .overrideProvider(NatsService)
      .useValue({ publishTagEvent: () => {} })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    db = module.get(DB_CLIENT_PROVIDER);

    await db
      .insert(users)
      .values({
        id: TEST_USER.id,
        email: TEST_USER.email,
        name: TEST_USER.name,
        emailVerified: true,
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, TEST_USER.id));
    await db.delete(events).execute();
    await app.close();
  });

  it("POST /events creates an event and persists it to the DB", async () => {
    const eventId = generateId();

    const res = await request(app.getHttpServer())
      .post("/events")
      .send({
        id: eventId,
        title: "Test Event",
        start: "2026-03-14T10:00:00+00:00",
        durationSeconds: 3600,
        timezone: "UTC",
      })
      .expect(201);

    expect(res.body.id).toBe(eventId);
    expect(res.body.title).toBe("Test Event");

    const rows = await db.select().from(events).where(eq(events.id, eventId));
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Test Event");
  });
});
