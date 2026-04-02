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
import { eventExceptions } from "@/migrations/schema/event_exceptions";
import { events } from "@/migrations/schema/events";
import { users } from "@/migrations/schema/users";
import { generateId } from "@/shared/id";
import { MockAuthGuard } from "@/test/helpers/mockAuthGuard";
import { TEST_USER } from "@/test/helpers/testUser";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

// Daily recurring event: 2026-04-10 10:00 UTC, runs daily until 2026-04-20
const RECURRING_START = "2026-04-10T10:00:00+00:00";
const RECURRING_RRULE = "FREQ=DAILY;UNTIL=20260420T235959Z";
const TIMEZONE = "UTC";

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

  it("PUT /events/:id updates a single event", async () => {
    const eventId = generateId();

    await request(app.getHttpServer())
      .post("/events")
      .send({
        id: eventId,
        title: "Original Title",
        start: "2026-03-14T10:00:00+00:00",
        durationSeconds: 3600,
        timezone: "UTC",
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .put(`/events/${eventId}`)
      .send({ title: "Updated Title" })
      .expect(200);

    expect(res.body.title).toBe("Updated Title");

    const rows = await db.select().from(events).where(eq(events.id, eventId));
    expect(rows[0].title).toBe("Updated Title");
  });

  it("DELETE /events/:id deletes a single event", async () => {
    const eventId = generateId();

    await request(app.getHttpServer())
      .post("/events")
      .send({
        id: eventId,
        title: "To Be Deleted",
        start: "2026-03-14T10:00:00+00:00",
        durationSeconds: 3600,
        timezone: "UTC",
      })
      .expect(201);

    await request(app.getHttpServer()).delete(`/events/${eventId}`).expect(204);

    const rows = await db.select().from(events).where(eq(events.id, eventId));
    expect(rows).toHaveLength(0);
  });

  it("POST /events creates a recurring event", async () => {
    const eventId = generateId();

    const res = await request(app.getHttpServer())
      .post("/events")
      .send({
        id: eventId,
        title: "Daily Standup",
        start: RECURRING_START,
        durationSeconds: 1800,
        timezone: TIMEZONE,
        rrule: RECURRING_RRULE,
      })
      .expect(201);

    expect(res.body.rrule).not.toBeNull();
    expect(res.body.isRecurring).toBe(true);

    const rows = await db.select().from(events).where(eq(events.id, eventId));
    expect(rows[0].rrule).not.toBeNull();
  });

  it("GET /events expands recurring event into instances", async () => {
    const eventId = generateId();

    // Daily event 2026-04-10 to 2026-04-12 (3 occurrences within window)
    await request(app.getHttpServer())
      .post("/events")
      .send({
        id: eventId,
        title: "Daily Meeting",
        start: "2026-04-10T10:00:00+00:00",
        durationSeconds: 3600,
        timezone: TIMEZONE,
        rrule: "FREQ=DAILY;UNTIL=20260412T235959Z",
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get("/events")
      .query({
        start: "2026-04-10T00:00:00+00:00",
        end: "2026-04-13T00:00:00+00:00",
        timezone: TIMEZONE,
      })
      .expect(200);

    const instances = res.body.filter(
      (i: { eventId: string }) => i.eventId === eventId,
    );
    expect(instances).toHaveLength(3);

    const starts = instances.map((i: { instanceStart: string }) =>
      i.instanceStart.slice(0, 10),
    );
    expect(starts).toContain("2026-04-10");
    expect(starts).toContain("2026-04-11");
    expect(starts).toContain("2026-04-12");
  });

  it("PUT /events/:id/instances/:start detaches a single instance", async () => {
    const eventId = generateId();
    const recurrenceStart = "2026-04-20T10:00:00+00:00";

    await request(app.getHttpServer())
      .post("/events")
      .send({
        id: eventId,
        title: "Weekly Sync",
        start: recurrenceStart,
        durationSeconds: 3600,
        timezone: TIMEZONE,
        rrule: RECURRING_RRULE,
      })
      .expect(201);

    const instanceStart = "2026-04-21T10:00:00+00:00";

    const res = await request(app.getHttpServer())
      .put(`/events/${eventId}/instances/${instanceStart}`)
      .send({ title: "Edited Instance" })
      .expect(200);

    // New standalone event returned
    expect(res.body.id).not.toBe(eventId);
    expect(res.body.title).toBe("Edited Instance");
    expect(res.body.rrule).toBeNull();
    expect(res.body.isRecurring).toBe(false);

    // Exception row inserted for parent
    const exRows = await db
      .select()
      .from(eventExceptions)
      .where(eq(eventExceptions.eventId, eventId));
    expect(exRows).toHaveLength(1);

    // Listing: detached event appears, parent occurrence on that date is gone
    const listRes = await request(app.getHttpServer())
      .get("/events")
      .query({
        start: "2026-04-20T00:00:00+00:00",
        end: "2026-04-22T00:00:00+00:00",
        timezone: TIMEZONE,
      })
      .expect(200);

    const detachedId = res.body.id;
    const onDate = listRes.body.filter((i: { instanceStart: string }) =>
      i.instanceStart.startsWith("2026-04-21"),
    );
    // Only the detached event, not the original parent occurrence
    expect(
      onDate.every((i: { eventId: string }) => i.eventId === detachedId),
    ).toBe(true);
  });

  it("POST /events/:id/exceptions removes a single recurring instance", async () => {
    const eventId = generateId();

    await request(app.getHttpServer())
      .post("/events")
      .send({
        id: eventId,
        title: "Daily Standup",
        start: RECURRING_START,
        durationSeconds: 1800,
        timezone: TIMEZONE,
        rrule: RECURRING_RRULE,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/events/${eventId}/exceptions`)
      .send({ occurrenceStart: "2026-04-11T10:00:00+00:00" })
      .expect(204);

    // Apr 11 occurrence should be absent
    const res = await request(app.getHttpServer())
      .get("/events")
      .query({
        start: "2026-04-10T00:00:00+00:00",
        end: "2026-04-13T00:00:00+00:00",
        timezone: TIMEZONE,
      })
      .expect(200);

    const instances = res.body.filter(
      (i: { eventId: string }) => i.eventId === eventId,
    );
    const starts = instances.map((i: { instanceStart: string }) =>
      i.instanceStart.slice(0, 10),
    );
    expect(starts).not.toContain("2026-04-11");
    expect(starts).toContain("2026-04-10");
    expect(starts).toContain("2026-04-12");
  });

  it("PUT /events/:id/split/:start splits a recurring series", async () => {
    const eventId = generateId();

    await request(app.getHttpServer())
      .post("/events")
      .send({
        id: eventId,
        title: "Daily Standup",
        start: RECURRING_START,
        durationSeconds: 1800,
        timezone: TIMEZONE,
        rrule: RECURRING_RRULE,
      })
      .expect(201);

    const splitStart = "2026-04-15T10:00:00+00:00";

    const res = await request(app.getHttpServer())
      .put(`/events/${eventId}/split/${splitStart}`)
      .send({})
      .expect(200);

    // New series returned, linked to parent
    expect(res.body.id).not.toBe(eventId);
    expect(res.body.isRecurring).toBe(true);

    // Original event rrule truncated before split date
    const originalRows = await db
      .select()
      .from(events)
      .where(eq(events.id, eventId));
    expect(originalRows[0].rrule).toContain("UNTIL=");
    // UNTIL should be before 2026-04-15
    const untilMatch = originalRows[0].rrule!.match(/UNTIL=(\d{8}T\d{6}Z)/);
    expect(untilMatch).not.toBeNull();
    const untilDate = new Date(
      untilMatch![1].replace(
        /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/,
        "$1-$2-$3T$4:$5:$6Z",
      ),
    );
    expect(untilDate.getTime()).toBeLessThan(
      new Date("2026-04-15T10:00:00Z").getTime(),
    );

    // New series starts at split date
    const newEventRows = await db
      .select()
      .from(events)
      .where(eq(events.id, res.body.id));
    expect(newEventRows[0].start).toEqual(new Date("2026-04-15T10:00:00Z"));
  });

  it("DELETE /events/:id removes all recurring instances", async () => {
    const eventId = generateId();

    await request(app.getHttpServer())
      .post("/events")
      .send({
        id: eventId,
        title: "Daily Standup",
        start: RECURRING_START,
        durationSeconds: 1800,
        timezone: TIMEZONE,
        rrule: RECURRING_RRULE,
      })
      .expect(201);

    await request(app.getHttpServer()).delete(`/events/${eventId}`).expect(204);

    const listRes = await request(app.getHttpServer())
      .get("/events")
      .query({
        start: "2026-04-10T00:00:00+00:00",
        end: "2026-04-21T00:00:00+00:00",
        timezone: TIMEZONE,
      })
      .expect(200);

    const instances = listRes.body.filter(
      (i: { eventId: string }) => i.eventId === eventId,
    );
    expect(instances).toHaveLength(0);
  });
});
