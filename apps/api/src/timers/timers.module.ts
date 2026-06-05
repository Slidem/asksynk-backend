import { Module } from "@nestjs/common";

import { TimersController } from "@/api/timers/rest/timers.controller";
import { TimerSettingsRepository } from "@/api/timers/timer-settings.repository";
import { TimersEventLogHandler } from "@/api/timers/timers.event-log.handler";
import { TimersRepository } from "@/api/timers/timers.repository";
import { TimersService } from "@/api/timers/timers.service";
import { TimersWorker } from "@/api/timers/timers.worker";
import { EventsPublisherModule } from "@/shared/event-publisher/events-publisher.module";
import { ScheduledJobModule } from "@/shared/scheduled-job/scheduled-job.module";

@Module({
  imports: [ScheduledJobModule, EventsPublisherModule],
  providers: [
    TimersRepository,
    TimerSettingsRepository,
    TimersService,
    TimersWorker,
    TimersEventLogHandler,
  ],
  controllers: [TimersController],
})
export class TimersModule {}
