import "reflect-metadata";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import * as dotenv from "dotenv";
import { eq } from "drizzle-orm";
import * as path from "path";
import request from "supertest";

import { generateId } from "@/api/kernel/id";
import { ClockModule } from "@/api/platform/clock/clock.module";
import { DB_CLIENT_PROVIDER, DbModule } from "@/api/platform/db/db.module";
import { TxModule } from "@/api/platform/db/tx.module";
import { AuthUser } from "@/api/platform/http/auth/auth.types";
import { SchedulingModule } from "@/api/scheduling/scheduling.module";
import { users } from "@/migrations/schema/users";
import { googleTestConfig } from "@/test/helpers/googleTestConfig";
import { MockAuthGuard } from "@/test/helpers/mockAuthGuard";
import {
  makeTestUser,
  testUserRegistry,
} from "@/test/helpers/testUserRegistry";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

// Europe/Bucharest: EEST (+03:00) until 2026-10-25 04:00, EET (+02:00) after.
// Request strings mirror the frontend: local wall clock + that date's offset.
const TZ = "Europe/Bucharest";

type InstanceDto = { eventId: string; instanceStart: string };

describe("Calendar events across DST (integration)", () => {
  let app: INestApplication;
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let user: AuthUser;

  beforeAll(async () => {
    user = makeTestUser();
    testUserRegistry.register(user, { default: true });

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: path.resolve(__dirname, "../../.env.test"),
          load: [googleTestConfig],
        }),
        DbModule,
        TxModule,
        ClockModule,
        SchedulingModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: MockAuthGuard }],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    db = module.get(DB_CLIENT_PROVIDER);

    await db
      .insert(users)
      .values({
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: true,
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, user.id));
    testUserRegistry.clear();
    await app.close();
  });

  const createEvent = async (start: string, rrule?: string, timezone = TZ) => {
    const id = generateId();
    await request(app.getHttpServer())
      .post("/calendar-events")
      .send({
        id,
        title: "DST",
        start,
        durationSeconds: 3600,
        timezone,
        ...(rrule ? { rrule } : {}),
      })
      .expect(201);
    return id;
  };

  const listStarts = async (
    eventId: string,
    start: string,
    end: string,
  ): Promise<string[]> => {
    const res = await request(app.getHttpServer())
      .get("/calendar-events")
      .query({ start, end })
      .expect(200);
    return (res.body as InstanceDto[])
      .filter((i) => i.eventId === eventId)
      .map((i) => i.instanceStart);
  };

  describe("one-off events", () => {
    it("keeps 10:00 local before DST end", async () => {
      const id = await createEvent("2026-10-20T10:00:00+03:00");
      expect(
        await listStarts(
          id,
          "2026-10-19T00:00:00+03:00",
          "2026-10-26T00:00:00+02:00",
        ),
      ).toEqual(["2026-10-20T07:00:00.000Z"]);
    });

    it("keeps 10:00 local after DST end", async () => {
      const id = await createEvent("2026-11-02T10:00:00+02:00");
      expect(
        await listStarts(
          id,
          "2026-11-02T00:00:00+02:00",
          "2026-11-09T00:00:00+02:00",
        ),
      ).toEqual(["2026-11-02T08:00:00.000Z"]);
    });
  });

  describe("recurring events", () => {
    it("weekly 10:00 local stays 10:00 local after DST end", async () => {
      const id = await createEvent("2026-10-20T10:00:00+03:00", "FREQ=WEEKLY");
      expect(
        await listStarts(
          id,
          "2026-10-19T00:00:00+03:00",
          "2026-11-09T00:00:00+02:00",
        ),
      ).toEqual([
        "2026-10-20T07:00:00.000Z",
        "2026-10-27T08:00:00.000Z",
        "2026-11-03T08:00:00.000Z",
      ]);
    });

    it("weekly near local midnight keeps its local weekday", async () => {
      // Tuesday 01:00 local = Monday 22:00Z; BYDAY is local (as Google sends it)
      const id = await createEvent(
        "2026-10-20T01:00:00+03:00",
        "FREQ=WEEKLY;BYDAY=TU",
      );
      expect(
        await listStarts(
          id,
          "2026-10-19T00:00:00+03:00",
          "2026-11-09T00:00:00+02:00",
        ),
      ).toEqual([
        "2026-10-19T22:00:00.000Z",
        "2026-10-26T23:00:00.000Z",
        "2026-11-02T23:00:00.000Z",
      ]);
    });

    it("includes the occurrence that sits exactly on UNTIL", async () => {
      const id = await createEvent(
        "2026-11-01T10:00:00+02:00",
        "FREQ=DAILY;UNTIL=20261103T080000Z",
      );
      expect(
        await listStarts(
          id,
          "2026-11-01T00:00:00+02:00",
          "2026-11-09T00:00:00+02:00",
        ),
      ).toEqual([
        "2026-11-01T08:00:00.000Z",
        "2026-11-02T08:00:00.000Z",
        "2026-11-03T08:00:00.000Z",
      ]);
    });

    it("follows the event timezone, not the viewer's", async () => {
      // 09:00 New York; NY leaves DST on Nov 1, a week after Bucharest
      const id = await createEvent(
        "2026-10-20T09:00:00-04:00",
        "FREQ=WEEKLY",
        "America/New_York",
      );
      expect(
        await listStarts(
          id,
          "2026-10-19T00:00:00+03:00",
          "2026-11-09T00:00:00+02:00",
        ),
      ).toEqual([
        "2026-10-20T13:00:00.000Z",
        "2026-10-27T13:00:00.000Z",
        "2026-11-03T14:00:00.000Z",
      ]);
    });
  });

  describe("occurrence edits", () => {
    const window = ["2026-10-19T00:00:00+03:00", "2026-11-09T00:00:00+02:00"];

    it("cancels an occurrence after DST end", async () => {
      const id = await createEvent("2026-10-20T10:00:00+03:00", "FREQ=WEEKLY");
      await request(app.getHttpServer())
        .post(`/calendar-events/${id}/exceptions`)
        .send({ occurrenceStart: "2026-10-27T10:00:00+02:00" })
        .expect(204);

      expect(await listStarts(id, window[0], window[1])).toEqual([
        "2026-10-20T07:00:00.000Z",
        "2026-11-03T08:00:00.000Z",
      ]);
    });

    it("matches an occurrence sent with any offset (instant semantics)", async () => {
      // NY event cancelled from a Bucharest browser: 09:00 EDT = 15:00 EET
      const id = await createEvent(
        "2026-10-20T09:00:00-04:00",
        "FREQ=WEEKLY",
        "America/New_York",
      );
      await request(app.getHttpServer())
        .post(`/calendar-events/${id}/exceptions`)
        .send({ occurrenceStart: "2026-10-27T15:00:00+02:00" })
        .expect(204);
      await request(app.getHttpServer())
        .post(`/calendar-events/${id}/exceptions`)
        .send({ occurrenceStart: "2026-11-03T14:00:00.000Z" })
        .expect(204);

      expect(await listStarts(id, window[0], window[1])).toEqual([
        "2026-10-20T13:00:00.000Z",
      ]);
    });

    it("split keeps the previous occurrence across spring-forward", async () => {
      // Daily 10:00 local; Mar 28 → Mar 29 is only 23h apart (EET → EEST)
      const id = await createEvent("2026-03-27T10:00:00+02:00", "FREQ=DAILY");
      const res = await request(app.getHttpServer())
        .put(
          `/calendar-events/${id}/split/${encodeURIComponent("2026-03-29T10:00:00+03:00")}`,
        )
        .send({
          title: "After split",
          start: "2026-03-29T10:00:00+03:00",
          timezone: TZ,
        })
        .expect(200);
      const newId = (res.body as InstanceDto).eventId;

      const range = ["2026-03-27T00:00:00+02:00", "2026-03-31T00:00:00+03:00"];
      expect(await listStarts(id, range[0], range[1])).toEqual([
        "2026-03-27T08:00:00.000Z",
        "2026-03-28T08:00:00.000Z",
      ]);
      expect(await listStarts(newId, range[0], range[1])).toEqual([
        "2026-03-29T07:00:00.000Z",
        "2026-03-30T07:00:00.000Z",
      ]);
    });
  });
});
