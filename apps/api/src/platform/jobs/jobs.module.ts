import { Module } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";

import { JobHandlersRegistry } from "@/api/platform/jobs/job-handlers.registry";
import { JobScheduler } from "@/api/platform/jobs/job-scheduler";
import { MessageBusModule } from "@/api/platform/jobs/message-bus/message-bus.module";
import { PgBossJobScheduler } from "@/api/platform/jobs/pgboss-job-scheduler";

/** Discovery is app-wide: only producers need to import this module. */
@Module({
  imports: [DiscoveryModule, MessageBusModule],
  providers: [
    JobHandlersRegistry,
    { provide: JobScheduler, useClass: PgBossJobScheduler },
  ],
  exports: [JobScheduler],
})
export class JobsModule {}
