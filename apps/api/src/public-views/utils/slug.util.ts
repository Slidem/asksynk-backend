import { randomBytes } from "crypto";

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function generateSlug(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export function generateGuestToken(): string {
  return randomBytes(32).toString("base64url");
}
