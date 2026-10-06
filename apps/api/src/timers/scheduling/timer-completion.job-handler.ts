import { Injectable } from "@nestjs/common";

import { JobHandler } from "@/api/platform/jobs/job-handler.decorator";
import {
  TimerCompletionJob,
  TimerCompletionPayload,
} from "@/api/timers/scheduling/timer-completion.job";
import { TimersService } from "@/api/timers/timers.service";

@Injectable()
export class TimerCompletionJobHandler {
  constructor(private readonly timersService: TimersService) {}

  @JobHandler(TimerCompletionJob)
  async handle(payload: TimerCompletionPayload): Promise<void> {
    await this.timersService.handleScheduledCompletion(payload);
  }
}
