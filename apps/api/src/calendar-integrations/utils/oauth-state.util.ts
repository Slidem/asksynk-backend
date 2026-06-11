import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface OAuthState {
  userId: string;
  provider: string;
  nonce: string;
}

/** Signs the OAuth `state` with HMAC so the callback can't be forged (CSRF guard). */
export function signOAuthState(
  state: Omit<OAuthState, "nonce">,
  secret: string,
): string {
  const full: OAuthState = { ...state, nonce: randomBytes(16).toString("hex") };
  const payload = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = sign(payload, secret);
  return `${payload}.${sig}`;
}

export function verifyOAuthState(
  token: string,
  secret: string,
): OAuthState | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const expected = sign(payload, secret);
  if (!safeEqual(sig, expected)) return null;

  try {
    return JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as OAuthState;
  } catch {
    return null;
  }
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
