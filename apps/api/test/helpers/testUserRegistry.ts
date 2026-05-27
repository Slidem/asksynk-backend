import { AuthUser } from "@/api/auth/auth.types";
import { generateId } from "@/shared/id";

class TestUserRegistry {
  private users = new Map<string, AuthUser>();
  private defaultUserId: string | null = null;

  register(user: AuthUser, opts?: { default?: boolean }): void {
    this.users.set(user.id, user);
    if (opts?.default) this.defaultUserId = user.id;
  }

  resolve(headerValue?: string | string[]): AuthUser {
    const id = Array.isArray(headerValue)
      ? headerValue[0]
      : (headerValue ?? this.defaultUserId);
    if (!id) throw new Error("No default test user registered");
    const u = this.users.get(id);
    if (!u) throw new Error(`Unknown test user ${id}`);
    return u;
  }

  clear(): void {
    this.users.clear();
    this.defaultUserId = null;
  }
}

export const testUserRegistry = new TestUserRegistry();

export function makeTestUser(overrides?: Partial<AuthUser>): AuthUser {
  const id = generateId();
  return {
    id,
    email: `${id}@test.example`,
    name: "Test User",
    emailVerified: true,
    ...overrides,
  };
}
