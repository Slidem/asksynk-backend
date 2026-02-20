import { Global, Module } from "@nestjs/common";

import { APP_GUARD } from "@nestjs/core";
import { AuthGuard } from "./auth.guard";
import { AuthModule } from "./auth.module";

@Global()
@Module({
  imports: [AuthModule],
  providers: [AuthGuard, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthGuardModule {}
