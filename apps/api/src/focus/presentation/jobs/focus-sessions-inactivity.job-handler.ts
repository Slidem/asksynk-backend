import { Injectable } from "@nestjs/common";

import { TimersService } from "@/api/focus/application/timers.service";
import { CronJob } from "@/api/platform/jobs/cron-job.decorator";

@Injectable()
export class FocusSessionsInactivityJobHandler {
  constructor(private readonly timersService: TimersService) {}

  /** Closes sessions of users who left them idle and never came back (lazy reset covers the rest). */
  @CronJob({ name: "focus.sessions.inactivity", cron: "*/5 * * * *" })
  async sweep(): Promise<void> {
    await this.timersService.resetInactiveSessions();
  }
}
