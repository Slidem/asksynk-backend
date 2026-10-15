import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { ActorAuthenticatorService } from "@/api/auth/application/actor-authenticator.service";
import { AuthService } from "@/api/auth/application/auth.service";
import { BetterAuthModule } from "@/api/auth/better-auth.module";
import { ActorAuthenticator } from "@/api/auth/contract/actor-authenticator.port";
import { GuestIdentityModule } from "@/api/auth/guest-identity.module";
import { AuthGuard } from "@/api/auth/presentation/rest/auth.guard";

@Module({
  imports: [ConfigModule, BetterAuthModule.forRoot(), GuestIdentityModule],
  providers: [
    AuthService,
    AuthGuard,
    { provide: ActorAuthenticator, useClass: ActorAuthenticatorService },
  ],
  exports: [
    AuthGuard,
    AuthService,
    ActorAuthenticator,
    GuestIdentityModule,
    BetterAuthModule,
  ],
})
export class AuthModule {}
