import { FocusSession } from "@/api/focus/domain/focus-session";
import { TimerEvent } from "@/api/focus/domain/timer.events";
import {
  AllowedCommand,
  isBreak,
  SessionEndReason,
  TimerCommand,
  TimerCommandInput,
  TimerMode,
  TimerSettingsValues,
  TimerStatus,
  TimerTransition,
  TimerTrigger,
  toSettingsSnapshot,
} from "@/api/focus/domain/timer.model";
import {
  allowedCommands,
  findCommandRule,
  findTriggerRule,
  TimerState,
  TimerTransitionRule,
} from "@/api/focus/domain/timer-transitions";
import { timersError } from "@/api/focus/focus.errors";
import { AggregateRoot } from "@/api/kernel/domain/aggregate-root";
import { generateId } from "@/api/kernel/id";

export interface TimerProps {
  id: string;
  userId: string;
  status: TimerStatus;
  mode: TimerMode | null;
  transitionedAt: Date | null;
  remainingAtTransition: number | null;
  focusBlocksUntilLongBreak: number | null;
  lastActivityAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The user's timer and its open `FocusSession`. Every change is checked against
 * `TIMER_TRANSITION_RULES`; due triggers (timeout, then inactivity) settle before
 * each command.
 */
export class Timer extends AggregateRoot<TimerEvent> {
  // Ended since the last save; persisted with it.
  private endedSessions: FocusSession[] = [];

  private constructor(
    private readonly props: TimerProps,
    private currentSession: FocusSession | null,
    version: number,
  ) {
    super(version);
  }

  static rehydrate(
    props: TimerProps,
    session: FocusSession | null,
    version: number,
  ): Timer {
    return new Timer({ ...props }, session, version);
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get status(): TimerStatus {
    return this.props.status;
  }
  get mode(): TimerMode | null {
    return this.props.mode;
  }
  get transitionedAt(): Date | null {
    return this.props.transitionedAt;
  }
  get remainingAtTransition(): number | null {
    return this.props.remainingAtTransition;
  }
  get focusBlocksUntilLongBreak(): number | null {
    return this.props.focusBlocksUntilLongBreak;
  }
  get lastActivityAt(): Date | null {
    return this.props.lastActivityAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get session(): FocusSession | null {
    return this.currentSession;
  }

  /** Sessions to write with this save: any ended since the last save, then the open one. */
  sessionsToSave(): FocusSession[] {
    return this.currentSession
      ? [...this.endedSessions, this.currentSession]
      : [...this.endedSessions];
  }

  override markSaved(): void {
    super.markSaved();
    this.endedSessions = [];
  }

  /**
   * Applies a client command. Due triggers settle first, so the command sees the
   * real current state (e.g. `resume` after the inactivity window → rejected).
   */
  execute(
    input: TimerCommandInput,
    settings: TimerSettingsValues,
    now: Date,
  ): void {
    assertValidCommandInput(input);
    this.settle(now, settings.inactivityTimeoutSeconds);

    switch (input.command) {
      case "start":
        this.start(input.mode!, settings, now);
        return;
      case "pause":
        this.pause(now);
        return;
      case "resume":
        this.resume(now);
        return;
      case "stop":
        this.stop(now);
        return;
      case "reset":
        this.reset(now);
        return;
    }
  }

  /** Applies due triggers: timeout, then inactivity. Returns whether anything changed. */
  settle(now: Date, inactivityTimeoutSeconds: number | null): boolean {
    let changed = false;
    if (this.isDue(now)) {
      this.complete(now);
      changed = true;
    }
    if (this.isInactive(now, inactivityTimeoutSeconds)) {
      // The session ended when the user was last active, not when we noticed.
      const at = this.props.lastActivityAt!;
      this.endSession(this.triggerRule("inactivity"), "inactivity", at, now);
      changed = true;
    }
    return changed;
  }

  /** Ends the session if its snapshot no longer matches `settings`. Returns whether it did. */
  applySettingsChange(settings: TimerSettingsValues, now: Date): boolean {
    if (!this.currentSession?.differsFrom(toSettingsSnapshot(settings))) {
      return false;
    }
    this.endSession(
      this.triggerRule("settings_changed"),
      "settings_changed",
      now,
      now,
    );
    return true;
  }

  /** Timeout trigger. Stamped at the due time, so a late (lazy) completion doesn't skew the log. */
  complete(now: Date): void {
    this.triggerRule("timeout");
    const completesAt = this.completesAt()!;
    const completedAt = completesAt < now ? completesAt : now;
    if (this.props.mode === "focus") {
      this.countFocusBlock();
    }
    this.props.status = "completed";
    this.props.remainingAtTransition = 0;
    this.props.lastActivityAt = completedAt;
    this.props.updatedAt = now;
    // Keeps `transitionedAt`: it identifies the completed run span.
    this.transitioned("completed", completedAt);
  }

  allowedCommands(): AllowedCommand[] {
    return allowedCommands(this.state());
  }

  /** Idle → focus; after/during focus → long break when the countdown hits 0; after a break → focus. */
  suggestedNextMode(): TimerMode {
    const { status, mode, focusBlocksUntilLongBreak } = this.props;
    if (status === "idle" || mode === null || isBreak(mode)) {
      return "focus";
    }
    const remaining = focusBlocksUntilLongBreak ?? 0;
    // A running/paused focus block counts once it ends.
    const afterThisBlock = status === "completed" ? remaining : remaining - 1;
    return afterThisBlock <= 0 ? "long_break" : "short_break";
  }

  /** Duration of the current block, from the session snapshot; null when idle. */
  blockDurationSeconds(): number | null {
    const { mode } = this.props;
    return mode && this.currentSession
      ? this.currentSession.durationFor(mode)
      : null;
  }

  /** Absolute time the running block completes; null unless running. */
  completesAt(): Date | null {
    if (
      this.props.status !== "running" ||
      this.props.transitionedAt === null ||
      this.props.remainingAtTransition === null
    ) {
      return null;
    }
    return new Date(
      this.props.transitionedAt.getTime() +
        this.props.remainingAtTransition * 1000,
    );
  }

  /** Live remaining seconds. Derived for running; frozen value otherwise; null when idle. */
  remainingSeconds(now: Date): number | null {
    const { status, transitionedAt, remainingAtTransition } = this.props;
    if (remainingAtTransition === null) return null;
    if (status !== "running" || transitionedAt === null) {
      return remainingAtTransition;
    }
    const elapsed = Math.floor(
      (now.getTime() - transitionedAt.getTime()) / 1000,
    );
    return Math.max(0, remainingAtTransition - elapsed);
  }

  /** True when a running block has reached/passed its completion time. */
  isDue(now: Date): boolean {
    const completesAt = this.completesAt();
    return completesAt !== null && now.getTime() >= completesAt.getTime();
  }

  /** True when a session sits untouched (not running) for longer than the timeout. */
  isInactive(now: Date, inactivityTimeoutSeconds: number | null): boolean {
    const { status, lastActivityAt } = this.props;
    return (
      this.currentSession !== null &&
      status !== "running" &&
      inactivityTimeoutSeconds !== null &&
      lastActivityAt !== null &&
      now.getTime() - lastActivityAt.getTime() > inactivityTimeoutSeconds * 1000
    );
  }

  /** True while still running the span that started at `transitionedAt` (completion-job staleness guard). */
  isRunSpan(transitionedAt: Date): boolean {
    return (
      this.props.status === "running" &&
      this.props.transitionedAt?.getTime() === transitionedAt.getTime()
    );
  }

  private start(
    mode: TimerMode,
    settings: TimerSettingsValues,
    now: Date,
  ): void {
    const rule = this.commandRule("start", mode);
    if (rule.blockEffect === "skip") {
      this.props.remainingAtTransition = this.remainingSeconds(now) ?? 0;
      // A skipped focus block counts like a completed one; the log tells them apart.
      if (this.props.mode === "focus") {
        this.countFocusBlock();
      }
      this.transitioned("skipped", now);
    }
    if (rule.sessionEffect === "create") {
      this.currentSession = FocusSession.open(
        generateId(),
        this.props.userId,
        toSettingsSnapshot(settings),
        now,
      );
      this.props.focusBlocksUntilLongBreak = settings.longBreakInterval;
    }

    const session = this.currentSession!;
    if (isBreak(mode)) {
      session.countBreakStarted(mode);
    }
    if (mode === "long_break") {
      this.props.focusBlocksUntilLongBreak = session.settings.longBreakInterval;
    }
    this.props.status = "running";
    this.props.mode = mode;
    this.props.remainingAtTransition = session.durationFor(mode);
    this.props.transitionedAt = now;
    this.touch(now);
    this.transitioned("started", now);
  }

  private pause(now: Date): void {
    this.commandRule("pause");
    this.props.remainingAtTransition = this.remainingSeconds(now) ?? 0;
    this.props.status = "paused";
    this.props.transitionedAt = now;
    this.touch(now);
    this.transitioned("paused", now);
  }

  private resume(now: Date): void {
    this.commandRule("resume");
    this.props.status = "running";
    this.props.transitionedAt = now;
    this.touch(now);
    this.transitioned("resumed", now);
  }

  /** Abandons the active block (if any); the session stays attached. */
  private stop(now: Date): void {
    const rule = this.commandRule("stop");
    if (rule.blockEffect === "abandon") {
      this.abandonBlock(now, null);
    }
    this.clearBlock();
    this.touch(now);
  }

  private reset(now: Date): void {
    const rule = this.commandRule("reset");
    if (rule.noop) return;
    this.endSession(rule, "manual_reset", now, now);
  }

  /** `at` = when the session ended (inactivity: last activity); `now` = when it's applied. */
  private endSession(
    rule: TimerTransitionRule,
    reason: SessionEndReason,
    at: Date,
    now: Date,
  ): void {
    if (rule.blockEffect === "abandon") {
      this.abandonBlock(at, reason);
    }
    const session = this.currentSession!;
    session.end(reason, at);
    this.endedSessions.push(session);
    this.record({
      type: "focus_session_ended",
      userId: this.props.userId,
      sessionId: session.id,
      reason,
      finishedAt: at,
    });
    this.currentSession = null;
    this.props.focusBlocksUntilLongBreak = null;
    this.clearBlock();
    this.props.lastActivityAt = at;
    this.props.updatedAt = now;
  }

  private abandonBlock(at: Date, reason: SessionEndReason | null): void {
    this.props.remainingAtTransition = this.remainingSeconds(at) ?? 0;
    this.transitioned("stopped", at, reason);
  }

  private clearBlock(): void {
    this.props.status = "idle";
    this.props.mode = null;
    this.props.transitionedAt = null;
    this.props.remainingAtTransition = null;
  }

  private countFocusBlock(): void {
    this.currentSession!.countFocusBlock();
    this.props.focusBlocksUntilLongBreak = Math.max(
      0,
      (this.props.focusBlocksUntilLongBreak ?? 0) - 1,
    );
  }

  private touch(now: Date): void {
    this.props.lastActivityAt = now;
    this.props.updatedAt = now;
  }

  private state(): TimerState {
    return {
      status: this.props.status,
      hasSession: this.currentSession !== null,
      mode: this.props.mode,
    };
  }

  private commandRule(
    command: TimerCommand,
    mode?: TimerMode,
  ): TimerTransitionRule {
    const rule = findCommandRule(this.state(), command, mode);
    if (!rule) {
      throw this.invalidTransition(mode ? `${command} ${mode}` : command);
    }
    return rule;
  }

  private triggerRule(trigger: TimerTrigger): TimerTransitionRule {
    const rule = findTriggerRule(this.state(), trigger);
    if (!rule) {
      throw this.invalidTransition(trigger);
    }
    return rule;
  }

  private invalidTransition(action: string) {
    return timersError("invalid_transition", {
      action,
      status: this.props.status,
      currentMode: this.props.mode ?? "none",
    });
  }

  /** Records a block transition from the current (post-mutation) block state. */
  private transitioned(
    transition: TimerTransition,
    occurredAt: Date,
    reason: SessionEndReason | null = null,
  ): void {
    const mode = this.props.mode!;
    const session = this.currentSession!;
    this.record({
      type: "timer_transitioned",
      transition,
      userId: this.props.userId,
      sessionId: session.id,
      mode,
      durationSeconds: session.durationFor(mode),
      remainingSeconds: this.props.remainingAtTransition!,
      reason,
      occurredAt,
    });
  }
}

export function assertValidCommandInput(input: TimerCommandInput): void {
  if (input.command === "start" && input.mode === undefined) {
    throw timersError("invalid_command_input", {
      reason: "mode is required to start",
    });
  }
  if (input.command !== "start" && input.mode !== undefined) {
    throw timersError("invalid_command_input", {
      reason: "mode is only valid with start",
    });
  }
}
