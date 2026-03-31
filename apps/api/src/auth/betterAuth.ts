import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins/bearer";
import { magicLink } from "better-auth/plugins/magic-link";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as authSchema from "@/migrations/schema/auth";
import { users } from "@/migrations/schema/users";

const FIVE_MINUTES_IN_SECONDS = 60 * 5;

const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

const ONE_WEEK_IN_SECONDS = ONE_DAY_IN_SECONDS * 7;

export type AuthConfig = {
  databaseUrl: string;
  secret: string;
  baseUrl?: string;
  trustedOrigins?: string[];
  sendMagicLink?: (params: { email: string; url: string }) => Promise<void>;
  sendVerificationEmail?: (params: {
    email: string;
    url: string;
    userName?: string;
  }) => Promise<void>;
};

export const createAuth = (config: AuthConfig) => {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    min: 1,
    max: 5,
  });

  const db = drizzle(pool, { schema: { ...authSchema, users } });

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: true,
      schema: {
        ...authSchema,
        users,
      },
    }),

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },

    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await (config.sendVerificationEmail?.({
          email: user.email,
          url,
          userName: user.name,
        }) ?? Promise.resolve());
      },
    },

    session: {
      cookieCache: {
        enabled: true,
        maxAge: FIVE_MINUTES_IN_SECONDS,
      },
      expiresIn: ONE_WEEK_IN_SECONDS,
      updateAge: ONE_DAY_IN_SECONDS,
    },

    user: {
      additionalFields: {
        firstName: {
          type: "string",
          required: false,
        },
        lastName: {
          type: "string",
          required: false,
        },
      },
    },

    plugins: [
      bearer(),
      magicLink({
        sendMagicLink: config.sendMagicLink ?? (async () => {}),
      }),
    ],

    secret: config.secret,
    basePath: "/api/auth",
    baseURL: config.baseUrl,
    trustedOrigins: config.trustedOrigins,
  });
};

export type Auth = ReturnType<typeof createAuth>;
