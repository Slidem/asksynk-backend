import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AuthGuard } from "@/api/auth/auth.guard";
import { AuthService } from "@/api/auth/auth.service";
import { BetterAuthModule } from "@/api/auth/betterAuth.module";
import { GuestIdentityModule } from "@/api/auth/guest-identity.module";

@Module({
  imports: [ConfigModule, BetterAuthModule.forRoot(), GuestIdentityModule],
  providers: [AuthService, AuthGuard],
  exports: [AuthGuard, AuthService, GuestIdentityModule, BetterAuthModule],
})
export class AuthModule {}
