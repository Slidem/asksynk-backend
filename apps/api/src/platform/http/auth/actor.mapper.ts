import { Actor } from "@/api/kernel/actor/actor";
import { AuthGuest, AuthUser } from "@/api/platform/http/auth/auth.types";

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
