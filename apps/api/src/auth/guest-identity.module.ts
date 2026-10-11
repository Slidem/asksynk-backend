import { Module } from "@nestjs/common";

import { GuestIdentityRegistry } from "@/api/auth/contract/guest-identity.provider";
import { GuestAuthService } from "@/api/auth/guest-auth.service";

// Kept apart from AuthModule so the token issuer can register without pulling in
// better-auth.
@Module({
  providers: [
    GuestAuthService,
    { provide: GuestIdentityRegistry, useExisting: GuestAuthService },
  ],
  exports: [GuestAuthService, GuestIdentityRegistry],
})
export class GuestIdentityModule {}
