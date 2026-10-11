import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { AuthModule } from "@/api/auth/auth.module";
import { AuthGuard } from "@/api/auth/presentation/rest/auth.guard";

@Global()
@Module({
  imports: [AuthModule],
  providers: [AuthGuard, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthGuardModule {}
