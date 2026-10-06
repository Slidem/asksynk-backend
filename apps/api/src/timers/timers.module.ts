import { Module } from "@nestjs/common";

import { EventsPublisherModule } from "@/api/platform/events/publisher/events-publisher.module";
import { JobsModule } from "@/api/platform/jobs/jobs.module";
import { TimersController } from "@/api/timers/rest/timers.controller";
import { TimerCompletionJobHandler } from "@/api/timers/scheduling/timer-completion.job-handler";
import { TimerSettingsRepository } from "@/api/timers/timer-settings.repository";
import { TimersEventLogHandler } from "@/api/timers/timers.event-log.handler";
import { TimersRepository } from "@/api/timers/timers.repository";
import { TimersService } from "@/api/timers/timers.service";

@Module({
  imports: [JobsModule, EventsPublisherModule],
  providers: [
    TimersRepository,
    TimerSettingsRepository,
    TimersService,
    TimerCompletionJobHandler,
    TimersEventLogHandler,
  ],
  controllers: [TimersController],
})
export class TimersModule {}
