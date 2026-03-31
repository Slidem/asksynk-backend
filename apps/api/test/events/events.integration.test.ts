import "reflect-metadata";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import * as dotenv from "dotenv";
import { eq } from "drizzle-orm";
import * as path from "path";
import request from "supertest";

import { EventsModule } from "@/api/events/events.module";
import {
  DB_CLIENT_PROVIDER,
  DbModule,
} from "@/api/infrastructure/db/db.module";
import { TxModule } from "@/api/infrastructure/db/tx.module";
import { NatsService } from "@/api/infrastructure/nats/nats.service";
import { events } from "@/migrations/schema/events";
import { users } from "@/migrations/schema/users";
import { generateId } from "@/shared/id";
import { MockAuthGuard } from "@/test/helpers/mockAuthGuard";
import { TEST_USER } from "@/test/helpers/testUser";

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
