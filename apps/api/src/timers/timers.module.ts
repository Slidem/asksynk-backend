import { Module } from "@nestjs/common";

import { EventsPublisherModule } from "@/api/platform/events/publisher/events-publisher.module";
import { JobsModule } from "@/api/platform/jobs/jobs.module";
import { TimerSettingsRepository } from "@/api/timers/domain/ports/timer-settings.repository";
import { TimersRepository } from "@/api/timers/domain/ports/timers.repository";
import { DrizzleTimerSettingsRepository } from "@/api/timers/drizzle-timer-settings.repository";
import { DrizzleTimersRepository } from "@/api/timers/drizzle-timers.repository";
import { TimersController } from "@/api/timers/rest/timers.controller";
import { TimerCompletionJobHandler } from "@/api/timers/scheduling/timer-completion.job-handler";
import { TimersEventLogHandler } from "@/api/timers/timers.event-log.handler";
import { TimersService } from "@/api/timers/timers.service";

@Module({
  imports: [JobsModule, EventsPublisherModule],
  providers: [
    { provide: TimersRepository, useClass: DrizzleTimersRepository },
    { provide: TimerSettingsRepository, useClass: DrizzleTimerSettingsRepository },
    TimersService,
    TimerCompletionJobHandler,
    TimersEventLogHandler,
  ],
  controllers: [TimersController],
})
export class TimersModule {}
