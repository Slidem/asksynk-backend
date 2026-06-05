import { Module } from "@nestjs/common";

import { MessageBusModule } from "../message-bus/message-bus.module";
import { PgBossScheduledJobService } from "./pgboss-scheduled-job.service";
import { ScheduledJobService } from "./scheduled-job.service";

@Module({
  imports: [MessageBusModule],
  providers: [
    { provide: ScheduledJobService, useClass: PgBossScheduledJobService },
  ],
  exports: [ScheduledJobService],
})
export class ScheduledJobModule {}
