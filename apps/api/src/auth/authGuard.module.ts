import { Global, Module } from "@nestjs/common";

import { AuthGuard } from "./auth.guard";
import { AuthModule } from "./auth.module";

@Global()
@Module({
  imports: [AuthModule],
  providers: [AuthGuard],
})
export class AuthGuardModule {}
