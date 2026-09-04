import { Module } from "@nestjs/common";

import { MessageBusModule } from "@/api/platform/jobs/message-bus/message-bus.module";
import { PgBossScheduledJobService } from "@/api/platform/jobs/scheduled-job/pgboss-scheduled-job.service";
import { ScheduledJobService } from "@/api/platform/jobs/scheduled-job/scheduled-job.service";

@Module({
  imports: [MessageBusModule],
  providers: [
    { provide: ScheduledJobService, useClass: PgBossScheduledJobService },
  ],
  exports: [ScheduledJobService],
})
export class ScheduledJobModule {}
