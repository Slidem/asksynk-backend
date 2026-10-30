import {
  BreakMode,
  SessionEndReason,
  TimerMode,
  TimerSettingsSnapshot,
} from "@/api/focus/domain/timer.model";

export interface FocusSessionProps {
  id: string;
  userId: string;
  startedAt: Date;
  finishedAt: Date | null;
  endReason: SessionEndReason | null;
  completedFocusBlocks: number;
  shortBreaks: number;
  longBreaks: number;
  settings: TimerSettingsSnapshot;
}

/**
 * A series of timer blocks between the first `start` and a reset. Entity inside the
 * `Timer` aggregate: only `Timer` mutates it, saved with the timer's version.
 */
export class FocusSession {
  private constructor(private readonly props: FocusSessionProps) {}

  static open(
    id: string,
    userId: string,
    settings: TimerSettingsSnapshot,
    now: Date,
  ): FocusSession {
    return new FocusSession({
      id,
      userId,
      startedAt: now,
      finishedAt: null,
      endReason: null,
      completedFocusBlocks: 0,
      shortBreaks: 0,
      longBreaks: 0,
      // Pick, don't spread: callers pass full settings (incl. the live-only timeout).
      settings: {
        focusDurationSeconds: settings.focusDurationSeconds,
        shortBreakDurationSeconds: settings.shortBreakDurationSeconds,
        longBreakDurationSeconds: settings.longBreakDurationSeconds,
        longBreakInterval: settings.longBreakInterval,
      },
    });
  }

  static rehydrate(props: FocusSessionProps): FocusSession {
    return new FocusSession({ ...props, settings: { ...props.settings } });
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get startedAt(): Date {
    return this.props.startedAt;
  }
  get finishedAt(): Date | null {
    return this.props.finishedAt;
  }
  get endReason(): SessionEndReason | null {
    return this.props.endReason;
  }
  get completedFocusBlocks(): number {
    return this.props.completedFocusBlocks;
  }
  get shortBreaks(): number {
    return this.props.shortBreaks;
  }
  get longBreaks(): number {
    return this.props.longBreaks;
  }
  get settings(): TimerSettingsSnapshot {
    return { ...this.props.settings };
  }

  durationFor(mode: TimerMode): number {
    switch (mode) {
      case "focus":
        return this.props.settings.focusDurationSeconds;
      case "short_break":
        return this.props.settings.shortBreakDurationSeconds;
      case "long_break":
        return this.props.settings.longBreakDurationSeconds;
    }
  }

  /** True when `settings` would run blocks differently than this session does. */
  differsFrom(settings: TimerSettingsSnapshot): boolean {
    const own = this.props.settings;
    return (
      own.focusDurationSeconds !== settings.focusDurationSeconds ||
      own.shortBreakDurationSeconds !== settings.shortBreakDurationSeconds ||
      own.longBreakDurationSeconds !== settings.longBreakDurationSeconds ||
      own.longBreakInterval !== settings.longBreakInterval
    );
  }

  /** A completed or skipped focus block. */
  countFocusBlock(): void {
    this.props.completedFocusBlocks += 1;
  }

  countBreakStarted(mode: BreakMode): void {
    if (mode === "short_break") {
      this.props.shortBreaks += 1;
    } else {
      this.props.longBreaks += 1;
    }
  }

  end(reason: SessionEndReason, at: Date): void {
    this.props.finishedAt = at;
    this.props.endReason = reason;
  }
}
