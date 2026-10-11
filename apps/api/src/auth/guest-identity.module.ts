import { Module } from "@nestjs/common";

import { GuestAuthService } from "@/api/auth/application/guest-auth.service";
import { GuestIdentityRegistry } from "@/api/auth/contract/guest-identity.provider";

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
