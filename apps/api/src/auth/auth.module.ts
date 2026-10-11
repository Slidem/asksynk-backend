import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AuthService } from "@/api/auth/application/auth.service";
import { BetterAuthModule } from "@/api/auth/better-auth.module";
import { GuestIdentityModule } from "@/api/auth/guest-identity.module";
import { AuthGuard } from "@/api/auth/presentation/rest/auth.guard";

@Module({
  imports: [ConfigModule, BetterAuthModule.forRoot(), GuestIdentityModule],
  providers: [AuthService, AuthGuard],
  exports: [AuthGuard, AuthService, GuestIdentityModule, BetterAuthModule],
})
export class AuthModule {}
