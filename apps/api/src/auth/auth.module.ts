import { AuthGuard } from "@/api/auth/auth.guard";
import { AuthService } from "@/api/auth/auth.service";
import { BetterAuthModule } from "@/api/auth/betterAuth.module";
import { ConfigModule } from "@nestjs/config";
import { Module } from "@nestjs/common";

@Module({
  imports: [ConfigModule, BetterAuthModule.forRoot()],
  providers: [AuthService, AuthGuard],
  exports: [AuthGuard, AuthService, BetterAuthModule],
})
export class AuthModule {}
