import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import {
  TimerCompletionJob,
  timerCompletionJobId,
  TimerCompletionPayload,
} from "@/api/focus/application/jobs/timer-completion.job";
import { TimerSettingsRepository } from "@/api/focus/domain/ports/timer-settings.repository";
import { TimersRepository } from "@/api/focus/domain/ports/timers.repository";
import { assertValidTransitionInput, Timer } from "@/api/focus/domain/timer";
import {
  BreakSuggestion,
  TransitionTimerInput,
  UpdateTimerSettingsInput,
} from "@/api/focus/domain/timer.model";
import { UserTimerSettings } from "@/api/focus/domain/user-timer-settings";
import { timersError } from "@/api/focus/focus.errors";
import { Actor } from "@/api/kernel/actor/actor";
import { isConcurrencyConflict } from "@/api/kernel/errors/kernel.errors";
import { Clock } from "@/api/platform/clock/clock";
import { JobScheduler } from "@/api/platform/jobs/job-scheduler";

@Injectable()
export class TimersService {
  constructor(
    private readonly timersRepo: TimersRepository,
    private readonly settingsRepo: TimerSettingsRepository,
    private readonly jobs: JobScheduler,
    private readonly clock: Clock,
  ) {}

  /** Current timer; lazily creates the idle row and completes an overdue running one. */
  @Transactional()
  async getCurrent(actor: Actor): Promise<Timer> {
    const now = this.clock.now();
    const userId = this.ownUserId(actor);
    const timer = await this.timersRepo.ensure(userId);
    if (!timer.isDue(now)) {
      return timer;
    }

    timer.complete(now);

    try {
      await this.timersRepo.save(timer);
      return timer;
    } catch (e) {
      // Lost the race to the completion job or a PATCH: their state wins.
      if (!isConcurrencyConflict(e)) throw e;
      return this.timersRepo.ensure(userId);
    }
  }

  /**
   * Single state-transition entry point for PATCH /timers. One tx: state, outbox
   * events, old-job cancel and new-job schedule commit (or roll back) together.
   */
  @Transactional()
  async applyTransition(
    actor: Actor,
    input: TransitionTimerInput,
  ): Promise<Timer> {
    assertValidTransitionInput(input);
    const now = this.clock.now();
    const timer = await this.timersRepo.ensure(this.ownUserId(actor));

    switch (input.status) {
      case "running":
        if (input.sessionType != null && input.durationSeconds != null) {
          timer.start(
            {
              sessionType: input.sessionType,
              durationSeconds: input.durationSeconds,
            },
            now,
          );
        } else {
          timer.resume(now);
        }
        break;
      case "paused":
        timer.pause(now);
        break;
      case "stopped":
        timer.stop(now);
        break;
      default:
        throw timersError("unsupported_status", { status: input.status });
    }

    await this.timersRepo.save(timer);

    const pendingJobId = this.pendingCompletionJobId(timer);

    if (pendingJobId) {
      await this.jobs.cancel(TimerCompletionJob, pendingJobId);
    }

    await this.scheduleCompletion(timer);
    return timer;
  }

  @Transactional()
  async getSettings(actor: Actor): Promise<UserTimerSettings> {
    return this.settingsRepo.ensure(this.ownUserId(actor));
  }

  @Transactional()
  async updateSettings(
    actor: Actor,
    input: UpdateTimerSettingsInput,
  ): Promise<UserTimerSettings> {
    return this.settingsRepo.update(
      this.ownUserId(actor),
      input,
      this.clock.now(),
    );
  }

  @Transactional()
  async getSuggestion(actor: Actor): Promise<BreakSuggestion> {
    const userId = this.ownUserId(actor);
    const timer = await this.timersRepo.ensure(userId);
    const settings = await this.settingsRepo.ensure(userId);
    const suggestedSessionType =
      timer.completedFocusSessions >= settings.longBreakInterval
        ? "long_break"
        : "short_break";
    return {
      suggestedSessionType,
      completedFocusSessions: timer.completedFocusSessions,
      longBreakInterval: settings.longBreakInterval,
    };
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

  private ownUserId(actor: Actor): string {
    if (actor.kind === "guest") {
      throw timersError("guest_not_allowed");
    }
    return actor.userId;
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
