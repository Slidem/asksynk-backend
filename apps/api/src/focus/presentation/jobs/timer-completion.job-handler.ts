import { Injectable } from "@nestjs/common";

import {
  TimerCompletionJob,
  TimerCompletionPayload,
} from "@/api/focus/application/jobs/timer-completion.job";
import { TimersService } from "@/api/focus/application/timers.service";
import { JobHandler } from "@/api/platform/jobs/job-handler.decorator";

@Injectable()
export class TimerCompletionJobHandler {
  constructor(private readonly timersService: TimersService) {}

  @JobHandler(TimerCompletionJob)
  async handle(payload: TimerCompletionPayload): Promise<void> {
    await this.timersService.handleScheduledCompletion(payload);
  }
}
