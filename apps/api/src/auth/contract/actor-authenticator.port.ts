import { Actor } from "@/api/kernel/actor/actor";
import { RequestHeaders } from "@/api/platform/http/auth/auth.types";

/** Resolves request headers to a user session or guest bearer token; null when neither is valid. */
export abstract class ActorAuthenticator {
  abstract authenticate(headers: RequestHeaders): Promise<Actor | null>;
}
