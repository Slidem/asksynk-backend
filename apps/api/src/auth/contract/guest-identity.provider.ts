export type GuestPrincipal = {
  guestId: string;
  publicViewId: string;
  ownerUserId: string;
  displayName: string;
  expiresAt: Date;
};

/** Resolves a guest bearer token; null when unknown, expired or its link is dead. */
export interface GuestIdentityProvider {
  validateToken(token: string): Promise<GuestPrincipal | null>;
}

/**
 * The context that issues guest tokens registers its provider here at bootstrap, so
 * auth never depends on it. No provider registered → every guest token is rejected.
 */
export abstract class GuestIdentityRegistry {
  abstract register(provider: GuestIdentityProvider): void;
}
