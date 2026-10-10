import { AuthGuest, AuthUser } from "@/api/auth/auth.types";
import { Actor } from "@/api/kernel/actor/actor";

export const userActor = (user: AuthUser): Actor => ({
  kind: "user",
  userId: user.id,
  email: user.email,
});

export const guestActor = (guest: AuthGuest): Actor => ({
  kind: "guest",
  guestId: guest.id,
  publicViewId: guest.publicViewId,
  ownerUserId: guest.ownerUserId,
  displayName: guest.displayName,
  expiresAt: guest.expiresAt,
});

/** Temporary bridge for messaging's guestX methods until they take `Actor` (roadmap 4.3). */
export const toAuthGuest = (
  actor: Extract<Actor, { kind: "guest" }>,
): AuthGuest => ({
  id: actor.guestId,
  publicViewId: actor.publicViewId,
  ownerUserId: actor.ownerUserId,
  displayName: actor.displayName,
  expiresAt: actor.expiresAt,
});
