import { Global, Module } from "@nestjs/common";

import { Clock, SystemClock } from "@/api/common/clock/clock";

@Global()
@Module({
  providers: [{ provide: Clock, useClass: SystemClock }],
  exports: [Clock],
})
export class ClockModule {}
