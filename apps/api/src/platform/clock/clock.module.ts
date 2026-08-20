import { Global, Module } from "@nestjs/common";
import { Clock } from "./clock";

import { SystemClock } from "@/api/platform/clock/clock";

@Global()
@Module({
  providers: [{ provide: Clock, useClass: SystemClock }],
  exports: [Clock],
})
export class ClockModule {}
