import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AuthGuard } from "@/api/auth/auth.guard";
import { AuthService } from "@/api/auth/auth.service";
import { BetterAuthModule } from "@/api/auth/betterAuth.module";

@Module({
  imports: [ConfigModule, BetterAuthModule.forRoot()],
  providers: [AuthService, AuthGuard],
  exports: [AuthGuard, AuthService, BetterAuthModule],
})
export class AuthModule {}
