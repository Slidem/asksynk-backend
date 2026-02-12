import { AuthGuard } from "@/api/auth/auth.guard";
import { AuthService } from "@/api/auth/auth.service";
import { ConfigModule } from "@nestjs/config";
import { Module } from "@nestjs/common";
import { UsersModule } from "@/api/modules/users.module";

@Module({
  imports: [ConfigModule, UsersModule],
  providers: [AuthService, AuthGuard],
  exports: [AuthGuard, AuthService],
})
export class AuthModule {}
