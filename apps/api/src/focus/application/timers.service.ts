import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";
import { ContextLogger } from "nestjs-context-logger";

import {
  TimerCompletionJob,
  timerCompletionJobId,
  TimerCompletionPayload,
} from "@/api/focus/application/jobs/timer-completion.job";
import { TimerSettingsRepository } from "@/api/focus/domain/ports/timer-settings.repository";
import { TimersRepository } from "@/api/focus/domain/ports/timers.repository";
import { Timer } from "@/api/focus/domain/timer";
import {
  TimerCommandInput,
  UpdateTimerSettingsInput,
} from "@/api/focus/domain/timer.model";
import {
  TIMER_TRANSITION_RULES,
  TimerTransitionRule,
} from "@/api/focus/domain/timer-transition-rules";
import { UserTimerSettings } from "@/api/focus/domain/user-timer-settings";
import { timersError } from "@/api/focus/focus.errors";
import { Actor } from "@/api/kernel/actor/actor";
import { isConcurrencyConflict } from "@/api/kernel/errors/kernel.errors";
import { Clock } from "@/api/platform/clock/clock";
import { JobScheduler } from "@/api/platform/jobs/job-scheduler";

@Injectable()
export class TimersService {
  private readonly logger = new ContextLogger(TimersService.name);

  constructor(
    private readonly timersRepo: TimersRepository,
    private readonly settingsRepo: TimerSettingsRepository,
    private readonly jobs: JobScheduler,
    private readonly clock: Clock,
  ) {}

  /** Current timer; lazily creates the idle row and settles due triggers (timeout, inactivity). */
  @Transactional()
  async getCurrent(actor: Actor): Promise<Timer> {
    const now = this.clock.now();
    const userId = this.ownUserId(actor);
    const settings = await this.settingsRepo.ensure(userId);
    const timer = await this.timersRepo.ensure(userId);
    const pendingJobId = this.pendingCompletionJobId(timer);

    if (!timer.settle(now, settings.inactivityTimeoutSeconds)) {
      return timer;
    }

    try {
      await this.timersRepo.save(timer);
    } catch (e) {
      // Lost the race to the completion job, the sweep or a PATCH: their state wins.
      if (!isConcurrencyConflict(e)) throw e;
      return this.timersRepo.ensure(userId);
    }
    await this.syncCompletionJob(timer, pendingJobId);
    return timer;
  }

  /**
   * Single entry point for `PATCH /timers`. One tx: state, sessions, outbox events,
   * old-job cancel and new-job schedule commit (or roll back) together.
   */
  @Transactional()
  async command(actor: Actor, input: TimerCommandInput): Promise<Timer> {
    const now = this.clock.now();
    const userId = this.ownUserId(actor);
    const settings = await this.settingsRepo.ensure(userId);
    const timer = await this.timersRepo.ensure(userId);
    const pendingJobId = this.pendingCompletionJobId(timer);

    timer.execute(input, settings, now);

    await this.timersRepo.save(timer);
    await this.syncCompletionJob(timer, pendingJobId);
    return timer;
  }

  /** The static state machine; the same for every user and timer. */
  getTransitions(actor: Actor): readonly TimerTransitionRule[] {
    this.ownUserId(actor);
    return TIMER_TRANSITION_RULES;
  }

  @Transactional()
  async getSettings(actor: Actor): Promise<UserTimerSettings> {
    return this.settingsRepo.ensure(this.ownUserId(actor));
  }

  /** Saves settings; ends the open session if its durations or interval changed. */
  @Transactional()
  async updateSettings(
    actor: Actor,
    input: UpdateTimerSettingsInput,
  ): Promise<UserTimerSettings> {
    const now = this.clock.now();
    const userId = this.ownUserId(actor);
    const settings = await this.settingsRepo.update(userId, input, now);
    const timer = await this.timersRepo.getByUserId(userId);
    if (!timer) {
      return settings;
    }

    const pendingJobId = this.pendingCompletionJobId(timer);
    const settled = timer.settle(now, settings.inactivityTimeoutSeconds);
    const sessionEnded = timer.applySettingsChange(settings, now);
    if (settled || sessionEnded) {
      await this.timersRepo.save(timer);
      await this.syncCompletionJob(timer, pendingJobId);
    }
    return settings;
  }

  /** Invoked by the scheduled completion job. Stale job → no-op; a conflict throws and the job retries. */
  @Transactional()
  async handleScheduledCompletion(
    payload: TimerCompletionPayload,
  ): Promise<void> {
    const timer = await this.timersRepo.getByUserId(payload.userId);
    if (!timer?.isRunSpan(new Date(payload.transitionedAt))) {
      return;
    }
    timer.complete(this.clock.now());
    await this.timersRepo.save(timer);
  }

  /**
   * Sweep: ends sessions left idle past the user's inactivity timeout. One tx per
   * user; a conflict means the user touched the timer meanwhile, so it's skipped.
   */
  async resetInactiveSessions(): Promise<void> {
    const now = this.clock.now();
    const userIds = await this.findInactiveUserIds(now);

    for (const userId of userIds) {
      try {
        await this.settleTimer(userId, now);
      } catch (e) {
        if (isConcurrencyConflict(e)) continue;
        // Keep sweeping the others; this user is retried on the next run.
        this.logger.error("Inactive session reset failed", {
          userId,
          error: e,
        });
      }
    }
  }

  @Transactional()
  private async findInactiveUserIds(now: Date): Promise<string[]> {
    return this.timersRepo.findInactiveUserIds(now);
  }

  @Transactional()
  private async settleTimer(userId: string, now: Date): Promise<void> {
    const settings = await this.settingsRepo.ensure(userId);
    const timer = await this.timersRepo.getByUserId(userId);
    if (!timer) return;

    const pendingJobId = this.pendingCompletionJobId(timer);
    if (!timer.settle(now, settings.inactivityTimeoutSeconds)) return;

    await this.timersRepo.save(timer);
    await this.syncCompletionJob(timer, pendingJobId);
  }

  private ownUserId(actor: Actor): string {
    if (actor.kind === "guest") {
      throw timersError("guest_not_allowed");
    }
    return actor.userId;
  }

  /** Cancels the job of a run span that ended; schedules the current span's (idempotent id). */
  private async syncCompletionJob(
    timer: Timer,
    previousJobId: string | null,
  ): Promise<void> {
    if (previousJobId && previousJobId !== this.pendingCompletionJobId(timer)) {
      await this.jobs.cancel(TimerCompletionJob, previousJobId);
    }
    await this.scheduleCompletion(timer);
  }

  /** Idempotent (deterministic job id). No-op unless running. */
  private async scheduleCompletion(timer: Timer): Promise<void> {
    const runAt = timer.completesAt();
    if (!runAt || timer.transitionedAt === null) return;
    await this.jobs.schedule(
      TimerCompletionJob,
      {
        userId: timer.userId,
        transitionedAt: timer.transitionedAt.toISOString(),
      },
      { id: timerCompletionJobId(timer.userId, timer.transitionedAt), runAt },
    );
  }

  /** Id of the completion job pending for `timer`, if any. Only a running timer has one. */
  private pendingCompletionJobId(timer: Timer): string | null {
    return timer.status === "running" && timer.transitionedAt
      ? timerCompletionJobId(timer.userId, timer.transitionedAt)
      : null;
  }
}
