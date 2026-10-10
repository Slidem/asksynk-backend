export type Actor =
  | { kind: "user"; userId: string; email: string }
  | {
      kind: "guest";
      guestId: string;
      publicViewId: string;
      ownerUserId: string;
      displayName: string;
      expiresAt: Date;
    };

export const ownerUserIdOf = (a: Actor): string =>
  a.kind === "guest" ? a.ownerUserId : a.userId;
