import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  ADMIN_API_KEY_HEADER,
  AdminApiKeyGuard,
} from "@/api/auth/admin-api-key.guard";

const KEY = "k".repeat(32);

const guardWith = (adminApiKey: string | undefined) =>
  new AdminApiKeyGuard({
    get: () => adminApiKey,
  } as unknown as ConfigService);

const contextWith = (headers: Record<string, string>) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  }) as unknown as ExecutionContext;

describe("AdminApiKeyGuard", () => {
  it("allows the correct key", () => {
    expect(
      guardWith(KEY).canActivate(contextWith({ [ADMIN_API_KEY_HEADER]: KEY })),
    ).toBe(true);
  });

  it.each([
    ["key unset", undefined, KEY],
    ["key too short", "short", "short"],
    ["header missing", KEY, undefined],
    ["wrong key", KEY, "x".repeat(32)],
  ])("rejects when %s", (_case, configured, provided) => {
    const headers: Record<string, string> = provided
      ? { [ADMIN_API_KEY_HEADER]: provided }
      : {};

    expect(() =>
      guardWith(configured).canActivate(contextWith(headers)),
    ).toThrow(UnauthorizedException);
  });
});
