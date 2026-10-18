import { Module } from "@nestjs/common";

import { TimersService } from "@/api/focus/application/timers.service";
import { TimerLogRepository } from "@/api/focus/domain/ports/timer-log.repository";
import { TimerSettingsRepository } from "@/api/focus/domain/ports/timer-settings.repository";
import { TimersRepository } from "@/api/focus/domain/ports/timers.repository";
import { DrizzleTimerLogRepository } from "@/api/focus/infrastructure/persistence/drizzle-timer-log.repository";
import { DrizzleTimerSettingsRepository } from "@/api/focus/infrastructure/persistence/drizzle-timer-settings.repository";
import { DrizzleTimersRepository } from "@/api/focus/infrastructure/persistence/drizzle-timers.repository";
import { TimerLogHandler } from "@/api/focus/presentation/events/timer-log.handler";
import { FocusSessionsInactivityJobHandler } from "@/api/focus/presentation/jobs/focus-sessions-inactivity.job-handler";
import { TimerCompletionJobHandler } from "@/api/focus/presentation/jobs/timer-completion.job-handler";
import { TimersController } from "@/api/focus/presentation/rest/timers.controller";
import { TimersBroadcaster } from "@/api/focus/presentation/ws/timers.broadcaster";
import { EventsPublisherModule } from "@/api/platform/events/publisher/events-publisher.module";
import { JobsModule } from "@/api/platform/jobs/jobs.module";

@Module({
  imports: [JobsModule, EventsPublisherModule],
  providers: [
    { provide: TimersRepository, useClass: DrizzleTimersRepository },
    { provide: TimerLogRepository, useClass: DrizzleTimerLogRepository },
    { provide: TimerSettingsRepository, useClass: DrizzleTimerSettingsRepository },
    TimersService,
    TimerCompletionJobHandler,
    FocusSessionsInactivityJobHandler,
    TimerLogHandler,
    TimersBroadcaster,
  ],
  controllers: [TimersController],
})
export class FocusModule {}
