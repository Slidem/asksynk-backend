import { Injectable, OnApplicationBootstrap } from "@nestjs/common";

import { TimerCompletionJob } from "@/api/timers/models/timer.model";
import { TIMER_COMPLETION_QUEUE } from "@/api/timers/scheduling/timer-jobs.constants";
import { TimersService } from "@/api/timers/timers.service";
import { ScheduledJobService } from "@/shared/scheduled-job/scheduled-job.service";

/** Subscribes the scheduled completion queue to the timers service at bootstrap. */
@Injectable()
export class TimersWorker implements OnApplicationBootstrap {
  constructor(
    private readonly scheduler: ScheduledJobService,
    private readonly timersService: TimersService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.scheduler.process<TimerCompletionJob>(
      TIMER_COMPLETION_QUEUE,
      (payload) => this.timersService.handleScheduledCompletion(payload),
    );
  }
}
