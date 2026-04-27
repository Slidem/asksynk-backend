import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AuthGuard } from "@/api/auth/auth.guard";
import { AuthService } from "@/api/auth/auth.service";
import { BetterAuthModule } from "@/api/auth/betterAuth.module";
import { GuestAuthService } from "@/api/auth/guest-auth.service";
import { PublicViewsModule } from "@/api/public-views/public-views.module";

@Module({
  imports: [ConfigModule, BetterAuthModule.forRoot(), PublicViewsModule],
  providers: [AuthService, GuestAuthService, AuthGuard],
  exports: [AuthGuard, AuthService, GuestAuthService, BetterAuthModule],
})
export class AuthModule {}
