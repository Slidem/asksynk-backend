import * as authSchema from "@/migrations/schema/auth";

import { Pool } from "pg";
import { bearer } from "better-auth/plugins/bearer";
import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/node-postgres";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins/magic-link";
import { users } from "@/migrations/schema/users";

export type AuthConfig = {
  databaseUrl: string;
  secret: string;
  baseUrl?: string;
  trustedOrigins?: string[];
  sendMagicLink?: (params: { email: string; url: string }) => Promise<void>;
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
        user: users,
      },
    }),

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },

    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
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
