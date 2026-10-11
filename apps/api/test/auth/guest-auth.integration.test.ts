import "reflect-metadata";

import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import * as dotenv from "dotenv";
import { eq } from "drizzle-orm";
import * as path from "path";
import request from "supertest";

import { AuthService } from "@/api/auth/application/auth.service";
import { GuestIdentityModule } from "@/api/auth/guest-identity.module";
import { AuthGuard } from "@/api/auth/presentation/rest/auth.guard";
import { generateId } from "@/api/kernel/id";
import { DB_CLIENT_PROVIDER, DbModule } from "@/api/platform/db/db.module";
import { TxModule } from "@/api/platform/db/tx.module";
import { SharingModule } from "@/api/sharing/sharing.module";
import { publicViewGuests, publicViews } from "@/migrations/schema/publicViews";
import { users } from "@/migrations/schema/users";

// better-auth ships ESM that Jest can't load; the user-session path is stubbed
// to always reject so every request falls through to the real guest path.
jest.mock("@/api/auth/application/auth.service", () => ({
  AuthService: class AuthService {
    async validateRequest(): Promise<never> {
      throw new UnauthorizedException();
    }
  },
}));

dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

// Real AuthGuard (no MockAuthGuard): guest sign-in → bearer token → @AllowGuest route.
describe("Guest auth (integration)", () => {
  let app: INestApplication;
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  const ownerId = generateId();

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
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
      providers: [
        AuthService,
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    db = module.get(DB_CLIENT_PROVIDER);
    await db.insert(users).values({
      id: ownerId,
      email: `${ownerId}@test.example`,
      name: "Owner",
      emailVerified: true,
    });
  });

  afterAll(async () => {
    await db.delete(publicViews).where(eq(publicViews.ownerUserId, ownerId));
    await db.delete(users).where(eq(users.id, ownerId));
    await app.close();
  });

  async function createView(): Promise<{ id: string; slug: string }> {
    const id = generateId();
    const slug = `slug-${id}`;
    await db.insert(publicViews).values({
      id,
      ownerUserId: ownerId,
      slug,
      expiresAt: new Date(Date.now() + 24 * 3600_000),
    });
    return { id, slug };
  }

  async function signIn(
    slug: string,
  ): Promise<{ guestId: string; token: string }> {
    const res = await request(app.getHttpServer())
      .post(`/public/views/${slug}/sign-in`)
      .send({ displayName: "Visitor" })
      .expect(201);
    return res.body;
  }

  const me = (token?: string) => {
    const req = request(app.getHttpServer()).get("/public/me");
    return token ? req.set("Authorization", `Bearer ${token}`) : req;
  };

  it("accepts the token issued at sign-in", async () => {
    const view = await createView();
    const { guestId, token } = await signIn(view.slug);

    const res = await me(token).expect(200);

    expect(res.body).toMatchObject({
      guestId,
      displayName: "Visitor",
      publicViewId: view.id,
    });
  });

  it("rejects a request without a token", async () => {
    await me().expect(401);
  });

  it("rejects an unknown token", async () => {
    await me("not-a-real-token").expect(401);
  });

  it("rejects the token once the link is revoked", async () => {
    const view = await createView();
    const { token } = await signIn(view.slug);
    await me(token).expect(200);

    await db
      .update(publicViews)
      .set({ revokedAt: new Date() })
      .where(eq(publicViews.id, view.id));

    await me(token).expect(401);
  });

  it("rejects the token once the guest session expires", async () => {
    const view = await createView();
    const { guestId, token } = await signIn(view.slug);

    await db
      .update(publicViewGuests)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(publicViewGuests.id, guestId));

    await me(token).expect(401);
  });
});
