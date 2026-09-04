import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { AuthGuard } from "@/api/auth/auth.guard";
import { AuthModule } from "@/api/auth/auth.module";

@Global()
@Module({
  imports: [AuthModule],
  providers: [AuthGuard, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthGuardModule {}
