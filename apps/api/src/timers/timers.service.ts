import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { Clock } from "@/api/platform/clock/clock";
import { EventsPublisher } from "@/api/platform/events/publisher/events-publisher";
import { TimerLifecycle } from "@/api/platform/events/registry/events.registry";
import { JobScheduler } from "@/api/platform/jobs/job-scheduler";
import {
  assertValidTransitionInput,
  Timer,
  TimerSession,
} from "@/api/timers/domain/timer";
import { UserTimerSettings } from "@/api/timers/entities/user-timer-settings.entity";
import {
  BreakSuggestion,
  TimerEventType,
  TimerSessionType,
  TransitionTimerInput,
  UpdateTimerSettingsInput,
} from "@/api/timers/models/timer.model";
import {
  TimerCompletionJob,
  timerCompletionJobId,
  TimerCompletionPayload,
} from "@/api/timers/scheduling/timer-completion.job";
import { TimerSettingsRepository } from "@/api/timers/timer-settings.repository";
import { timersError } from "@/api/timers/timers.errors";
import { TimersRepository } from "@/api/timers/timers.repository";

interface PersistResult {
  entity: Timer;
  jobToCancel: string | null;
}

@Injectable()
export class TimersService {
  constructor(
    private readonly timersRepo: TimersRepository,
    private readonly settingsRepo: TimerSettingsRepository,
    private readonly jobs: JobScheduler,
    private readonly eventsPublisher: EventsPublisher,
    private readonly clock: Clock,
  ) {}

  /** Current timer; lazily creates the idle row and completes an overdue running one. */
  @Transactional()
  async getCurrent(userId: string): Promise<Timer> {
    const now = this.clock.now();
    const timer = await this.timersRepo.ensure(userId);

    if (timer.status === "running" && timer.isDue(now)) {
      const completed = await this.complete(timer, now);
      if (completed) {
        return completed;
      }
    }

    return timer;
  }

  /**
   * Single state-transition entry point for PATCH /timers. Wraps the whole
   * transition in one tx so the persist, old-job cancel, and new-job schedule
   * commit (or roll back) atomically.
   */
  @Transactional()
  async applyTransition(
    userId: string,
    input: TransitionTimerInput,
  ): Promise<Timer> {
    assertValidTransitionInput(input);

    switch (input.status) {
      case "running":
        return input.sessionType != null && input.durationSeconds != null
          ? this.startSession(userId, {
              sessionType: input.sessionType,
              durationSeconds: input.durationSeconds,
            })
          : this.resumeSession(userId);
      case "paused":
        return this.pauseSession(userId);
      case "stopped":
        return this.stopSession(userId);
      default:
        throw timersError("unsupported_status", { status: input.status });
    }
  }

  @Transactional()
  async getSettings(userId: string): Promise<UserTimerSettings> {
    return this.settingsRepo.ensure(userId);
  }

  @Transactional()
  async updateSettings(
    userId: string,
    input: UpdateTimerSettingsInput,
  ): Promise<UserTimerSettings> {
    return this.settingsRepo.update(userId, input, this.clock.now());
  }

  @Transactional()
  async getSuggestion(userId: string): Promise<BreakSuggestion> {
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

  /** Invoked by the scheduled completion job. Idempotent + staleness-guarded. */
  @Transactional()
  async handleScheduledCompletion(
    payload: TimerCompletionPayload,
  ): Promise<void> {
    const now = this.clock.now();
    const timer = await this.timersRepo.getByUserId(payload.userId);
    if (!timer || timer.status !== "running" || timer.transitionedAt === null) {
      return;
    }
    const guard = new Date(payload.transitionedAt);
    if (timer.transitionedAt.getTime() !== guard.getTime()) return;
    await this.complete(timer, now);
  }

  // --- transition orchestrators (persist + cancel + schedule all join applyTransition's tx) ---
  private async startSession(
    userId: string,
    session: TimerSession,
  ): Promise<Timer> {
    const { entity, jobToCancel } = await this.persistStart(userId, session);

    if (jobToCancel) {
      await this.jobs.cancel(TimerCompletionJob, jobToCancel);
    }

    await this.scheduleCompletion(entity);
    return entity;
  }

  private async resumeSession(userId: string): Promise<Timer> {
    const timer = await this.persistResume(userId);
    await this.scheduleCompletion(timer);
    return timer;
  }

  private async pauseSession(userId: string): Promise<Timer> {
    const { entity, jobToCancel } = await this.persistPause(userId);
    if (jobToCancel) {
      await this.jobs.cancel(TimerCompletionJob, jobToCancel);
    }
    return entity;
  }

  private async stopSession(userId: string): Promise<Timer> {
    const { entity, jobToCancel } = await this.persistStop(userId);
    if (jobToCancel) {
      await this.jobs.cancel(TimerCompletionJob, jobToCancel);
    }
    return entity;
  }

  private async persistStart(
    userId: string,
    session: TimerSession,
  ): Promise<PersistResult> {
    const now = this.clock.now();
    const current = await this.timersRepo.ensure(userId);
    const transition = current.start(session);

    // Completing the running session counts toward the long-break cadence and
    // fires the completion notification; its completion job gets cancelled.
    const jobToCancel = this.pendingCompletionJobId(current);

    if (transition.completesCurrent) {
      await this.complete(current, now);
    }

    const updated = await this.timersRepo.start(userId, {
      sessionType: session.sessionType,
      durationSeconds: session.durationSeconds,
      transitionedAt: now,
      resetFocusCounter: transition.resetFocusCounter,
    });

    await this.publishLifecycle({
      userId,
      eventType: "started",
      sessionType: session.sessionType,
      sessionDurationSeconds: session.durationSeconds,
      remainingSeconds: session.durationSeconds,
      occurredAt: now,
    });

    return { entity: updated, jobToCancel };
  }

  private async persistResume(userId: string): Promise<Timer> {
    const now = this.clock.now();
    const current = await this.timersRepo.ensure(userId);
    current.resume();
    const updated = await this.timersRepo.resume(userId, now);
    if (!updated) throw timersError("timer_not_paused");
    await this.publishLifecycle({
      userId,
      eventType: "resumed",
      sessionType: updated.sessionType!,
      sessionDurationSeconds: updated.sessionDurationSeconds!,
      remainingSeconds: updated.remainingAtTransition!,
      occurredAt: now,
    });
    return updated;
  }

  private async persistPause(userId: string): Promise<PersistResult> {
    const now = this.clock.now();
    const current = await this.timersRepo.ensure(userId);
    const transition = current.pause(now);
    const jobToCancel = this.pendingCompletionJobId(current);

    if (transition.type === "completed") {
      const completed = await this.complete(current, now);
      return { entity: completed ?? current, jobToCancel };
    }

    const { remainingSeconds } = transition;
    const updated = await this.timersRepo.pause(userId, remainingSeconds, now);
    if (!updated) throw timersError("timer_not_running");
    await this.publishLifecycle({
      userId,
      eventType: "paused",
      sessionType: updated.sessionType!,
      sessionDurationSeconds: updated.sessionDurationSeconds!,
      remainingSeconds,
      occurredAt: now,
    });
    return { entity: updated, jobToCancel };
  }

  private async persistStop(userId: string): Promise<PersistResult> {
    const now = this.clock.now();
    const current = await this.timersRepo.ensure(userId);
    const transition = current.stop(now);

    const jobToCancel = this.pendingCompletionJobId(current);
    const { remainingSeconds } = transition;
    const updated = await this.timersRepo.stop(userId, remainingSeconds, now);

    if (!updated) {
      throw timersError("no_active_timer");
    }

    await this.publishLifecycle({
      userId,
      eventType: "stopped",
      sessionType: updated.sessionType!,
      sessionDurationSeconds: updated.sessionDurationSeconds!,
      remainingSeconds,
      occurredAt: now,
    });
    return { entity: updated, jobToCancel };
  }

  // --- shared helpers ---

  /** Publish a lifecycle event; a durable consumer persists it to the event log. */
  private async publishLifecycle(input: {
    userId: string;
    eventType: TimerEventType;
    sessionType: TimerSessionType;
    sessionDurationSeconds: number;
    remainingSeconds: number;
    occurredAt: Date;
  }): Promise<void> {
    await this.eventsPublisher.publish(TimerLifecycle, {
      userId: input.userId,
      eventType: input.eventType,
      sessionType: input.sessionType,
      sessionDurationSeconds: input.sessionDurationSeconds,
      remainingSeconds: input.remainingSeconds,
      occurredAt: input.occurredAt.toISOString(),
    });
  }

  /**
   * Idempotent completion shared by the job, lazy-GET, and pause-when-due. Returns the completed timer, or
   * null if nothing was completed (lost the race / stale).
   */
  private async complete(timer: Timer, now: Date): Promise<Timer | null> {
    const { transitionedAt } = timer.complete();

    const completed = await this.timersRepo.completeIfRunning(
      timer.userId,
      transitionedAt,
      now,
    );

    if (!completed) return null;

    await this.publishLifecycle({
      userId: completed.userId,
      eventType: "completed",
      sessionType: completed.sessionType!,
      sessionDurationSeconds: completed.sessionDurationSeconds!,
      remainingSeconds: 0,
      occurredAt: now,
    });

    return completed;
  }

  /**
   * Schedules a completion job for a running timer. Idempotent to allow safe retries. If the timer is not running or
   * has no transitionedAt, does nothing. Caller should ensure the timer is still running at the scheduled time to avoid
   * zombies.
   */
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
