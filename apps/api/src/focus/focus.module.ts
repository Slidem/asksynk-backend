import { Module } from "@nestjs/common";

import { TimersService } from "@/api/focus/application/timers.service";
import { TimerSettingsRepository } from "@/api/focus/domain/ports/timer-settings.repository";
import { TimersRepository } from "@/api/focus/domain/ports/timers.repository";
import { DrizzleTimerSettingsRepository } from "@/api/focus/infrastructure/persistence/drizzle-timer-settings.repository";
import { DrizzleTimersRepository } from "@/api/focus/infrastructure/persistence/drizzle-timers.repository";
import { TimersEventLogHandler } from "@/api/focus/presentation/events/timers.event-log.handler";
import { TimerCompletionJobHandler } from "@/api/focus/presentation/jobs/timer-completion.job-handler";
import { TimersController } from "@/api/focus/presentation/rest/timers.controller";
import { EventsPublisherModule } from "@/api/platform/events/publisher/events-publisher.module";
import { JobsModule } from "@/api/platform/jobs/jobs.module";

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
export class FocusModule {}
