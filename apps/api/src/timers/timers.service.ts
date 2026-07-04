import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { Clock } from "@/api/common/clock/clock";
import { AsksynkError } from "@/api/common/errors/errors.model";
import { UserTimer } from "@/api/timers/entities/user-timer.entity";
import { UserTimerSettings } from "@/api/timers/entities/user-timer-settings.entity";
import {
  BreakSuggestion,
  TimerCompletionJob,
  TimerEventType,
  TimerSessionType,
  TransitionTimerInput,
  UpdateTimerSettingsInput,
} from "@/api/timers/models/timer.model";
import { TIMER_COMPLETION_QUEUE } from "@/api/timers/scheduling/timer-jobs.constants";
import { TimerSettingsRepository } from "@/api/timers/timer-settings.repository";
import { TimersRepository } from "@/api/timers/timers.repository";
import { EventsPublisher } from "@/shared/event-publisher/events-publisher";
import { TimerLifecycle } from "@/shared/event-registry/events.registry";
import { ScheduledJobService } from "@/shared/scheduled-job/scheduled-job.service";

interface PersistResult {
  entity: UserTimer;
  jobIdToCancel: string | null;
}

@Injectable()
export class TimersService {
  constructor(
    private readonly timersRepo: TimersRepository,
    private readonly settingsRepo: TimerSettingsRepository,
    private readonly scheduler: ScheduledJobService,
    private readonly eventsPublisher: EventsPublisher,
    private readonly clock: Clock,
  ) {}

  /** Current timer; lazily creates the idle row and completes an overdue running one. */
  @Transactional()
  async getCurrent(userId: string): Promise<UserTimer> {
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
   * transition in one tx so the persist, old-job cancel, new-job schedule, and
   * job-ref write commit (or roll back) atomically.
   */
  @Transactional()
  async applyTransition(
    userId: string,
    input: TransitionTimerInput,
  ): Promise<UserTimer> {
    this.validateTransitionInput(input);

    switch (input.status) {
      case "running":
        return input.sessionType != null && input.durationSeconds != null
          ? this.startSession(userId, input.sessionType, input.durationSeconds)
          : this.resumeSession(userId);
      case "paused":
        return this.pauseSession(userId);
      case "stopped":
        return this.stopSession(userId);
      default:
        throw AsksynkError.badRequest("Unsupported timer status");
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
  async handleScheduledCompletion(payload: TimerCompletionJob): Promise<void> {
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
    sessionType: TimerSessionType,
    durationSeconds: number,
  ): Promise<UserTimer> {
    const { entity, jobIdToCancel } = await this.persistStart(
      userId,
      sessionType,
      durationSeconds,
    );
    // Cancel the overridden session's job before scheduling the new one so the
    // `timer:<userId>` singleton key is free.
    if (jobIdToCancel) {
      await this.scheduler.cancel(TIMER_COMPLETION_QUEUE, jobIdToCancel);
    }
    await this.scheduleCompletion(entity);
    return entity;
  }

  private async resumeSession(userId: string): Promise<UserTimer> {
    const timer = await this.persistResume(userId);
    await this.scheduleCompletion(timer);
    return timer;
  }

  private async pauseSession(userId: string): Promise<UserTimer> {
    const { entity, jobIdToCancel } = await this.persistPause(userId);
    if (jobIdToCancel) {
      await this.scheduler.cancel(TIMER_COMPLETION_QUEUE, jobIdToCancel);
    }
    return entity;
  }

  private async stopSession(userId: string): Promise<UserTimer> {
    const { entity, jobIdToCancel } = await this.persistStop(userId);
    if (jobIdToCancel) {
      await this.scheduler.cancel(TIMER_COMPLETION_QUEUE, jobIdToCancel);
    }
    return entity;
  }

  private async persistStart(
    userId: string,
    sessionType: TimerSessionType,
    durationSeconds: number,
  ): Promise<PersistResult> {
    const now = this.clock.now();
    const current = await this.timersRepo.ensure(userId);

    // Direct switch from a running session: complete the current one first
    // (counts toward the long-break cadence + fires the completion notification),
    // then start the new session and cancel the old completion job.
    const jobIdToCancel =
      current.status === "running" ? current.pendingCompletionJobRef : null;

    if (current.status === "running") {
      await this.complete(current, now);
    }

    const updated = await this.timersRepo.start(userId, {
      sessionType,
      durationSeconds,
      transitionedAt: now,
      resetFocusCounter: sessionType === "long_break",
    });

    await this.publishLifecycle({
      userId,
      eventType: "started",
      sessionType,
      sessionDurationSeconds: durationSeconds,
      remainingSeconds: durationSeconds,
      occurredAt: now,
    });
    return { entity: updated, jobIdToCancel };
  }

  private async persistResume(userId: string): Promise<UserTimer> {
    const now = this.clock.now();
    const current = await this.timersRepo.ensure(userId);
    if (current.status !== "paused") {
      throw AsksynkError.badRequest("Timer not paused");
    }
    const updated = await this.timersRepo.resume(userId, now);
    if (!updated) throw AsksynkError.badRequest("Timer not paused");
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
    if (current.status !== "running") {
      throw AsksynkError.badRequest("Timer not running");
    }
    const jobIdToCancel = current.pendingCompletionJobRef;
    const remaining = current.remainingSeconds(now) ?? 0;

    // Past due → complete instead of leaving a "paused at 0" zombie.
    if (remaining <= 0) {
      const completed = await this.complete(current, now);
      return { entity: completed ?? current, jobIdToCancel };
    }

    const updated = await this.timersRepo.pause(userId, remaining, now);
    if (!updated) throw AsksynkError.badRequest("Timer not running");
    await this.publishLifecycle({
      userId,
      eventType: "paused",
      sessionType: updated.sessionType!,
      sessionDurationSeconds: updated.sessionDurationSeconds!,
      remainingSeconds: remaining,
      occurredAt: now,
    });
    return { entity: updated, jobIdToCancel };
  }

  private async persistStop(userId: string): Promise<PersistResult> {
    const now = this.clock.now();
    const current = await this.timersRepo.ensure(userId);

    if (current.status !== "running" && current.status !== "paused") {
      throw AsksynkError.badRequest("No active timer");
    }

    const jobIdToCancel = current.pendingCompletionJobRef;
    const remaining = current.remainingSeconds(now) ?? 0;
    const updated = await this.timersRepo.stop(userId, remaining, now);

    if (!updated) {
      throw AsksynkError.badRequest("No active timer");
    }

    await this.publishLifecycle({
      userId,
      eventType: "stopped",
      sessionType: updated.sessionType!,
      sessionDurationSeconds: updated.sessionDurationSeconds!,
      remainingSeconds: remaining,
      occurredAt: now,
    });
    return { entity: updated, jobIdToCancel };
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
  private async complete(
    timer: UserTimer,
    now: Date,
  ): Promise<UserTimer | null> {
    if (timer.transitionedAt === null) return null;

    const completed = await this.timersRepo.completeIfRunning(
      timer.userId,
      timer.transitionedAt,
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
  private async scheduleCompletion(timer: UserTimer): Promise<void> {
    const runAt = timer.completesAt();
    if (!runAt || timer.transitionedAt === null) return;
    const ref = await this.scheduler.schedule<TimerCompletionJob>(
      TIMER_COMPLETION_QUEUE,
      {
        payload: {
          userId: timer.userId,
          transitionedAt: timer.transitionedAt.toISOString(),
        },
        runAt,
        jobId: `timer:${timer.userId}`,
      },
    );
    if (ref) await this.attachJobRef(timer.userId, ref, timer.transitionedAt);
  }

  private async attachJobRef(
    userId: string,
    ref: string,
    transitionedAt: Date,
  ): Promise<void> {
    await this.timersRepo.setPendingJobRef(userId, ref, transitionedAt);
  }

  private validateTransitionInput(input: TransitionTimerInput): void {
    const hasSessionType = input.sessionType != null;
    const hasDuration = input.durationSeconds != null;
    if (hasSessionType !== hasDuration) {
      throw AsksynkError.badRequest(
        "sessionType and durationSeconds must be provided together",
      );
    }
    if (hasSessionType && input.status !== "running") {
      throw AsksynkError.badRequest(
        "Session fields are only valid when starting (status=running)",
      );
    }
  }
}
