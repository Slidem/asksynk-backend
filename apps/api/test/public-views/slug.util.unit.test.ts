import { createHash } from "crypto";

import {
  generateGuestToken,
  generateSlug,
  hashGuestToken,
} from "@/api/public-views/utils/slug.util";

describe("Generate slug", () => {
  it.each([1, 8, 16, 64])("returns a slug of length %i", (length) => {
    expect(generateSlug(length)).toHaveLength(length);
  });

  it("returns an empty slug for length 0", () => {
    expect(generateSlug(0)).toBe("");
  });

  it("only uses unambiguous lowercase alphanumerics", () => {
    const slug = generateSlug(10_000);
    expect(slug).toMatch(/^[a-km-np-z2-9]+$/);
  });

  it("generates distinct slugs", () => {
    const slugs = new Set(Array.from({ length: 1000 }, () => generateSlug(16)));
    expect(slugs.size).toBe(1000);
  });
});

describe("Generate guest token", () => {
  it("returns a 32-byte base64url token", () => {
    const token = generateGuestToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("generates distinct tokens", () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateGuestToken));
    expect(tokens.size).toBe(1000);
  });
});

describe("Hash guest token", () => {
  it("returns the hex sha256 of the token", () => {
    const token = "abc";
    expect(hashGuestToken(token)).toBe(
      createHash("sha256").update(token).digest("hex"),
    );
  });

  it("is deterministic", () => {
    const token = generateGuestToken();
    expect(hashGuestToken(token)).toBe(hashGuestToken(token));
  });

  it("differs from the raw token and between tokens", () => {
    const a = generateGuestToken();
    const b = generateGuestToken();
    expect(hashGuestToken(a)).not.toBe(a);
    expect(hashGuestToken(a)).not.toBe(hashGuestToken(b));
  });

  it("matches the migration's postgres hashing", () => {
    // 0010_hash_guest_tokens: encode(sha256(convert_to(token, 'UTF8')), 'hex')
    expect(hashGuestToken("token")).toBe(
      "3c469e9d6c5875d37a43f353d4f88e61fcf812c66eee3457465a40b0da4153e0",
    );
  });
});
