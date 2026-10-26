import {
  FocusSession,
  FocusSessionProps,
} from "@/api/focus/domain/focus-session";
import { Timer, TimerProps } from "@/api/focus/domain/timer";
import {
  FocusSessionEnded,
  TimerEvent,
  TimerTransitioned,
} from "@/api/focus/domain/timer.events";
import {
  TimerCommand,
  TimerMode,
  TimerSettingsValues,
  TimerStatus,
} from "@/api/focus/domain/timer.model";

export const t0 = new Date("2026-01-01T10:00:00Z");
export const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);

export const SETTINGS: TimerSettingsValues = {
  focusDurationSeconds: 1500,
  shortBreakDurationSeconds: 300,
  longBreakDurationSeconds: 900,
  longBreakInterval: 4,
  inactivityTimeoutSeconds: 3600,
};

export const session = (props: Partial<FocusSessionProps> = {}) =>
  FocusSession.rehydrate({
    id: "s1",
    userId: "u1",
    startedAt: t0,
    finishedAt: null,
    endReason: null,
    completedFocusBlocks: 0,
    shortBreaks: 0,
    longBreaks: 0,
    settings: SETTINGS,
    ...props,
  });

export interface TimerFixture {
  mode?: TimerMode;
  // Default: idle has none, any other status has one.
  hasSession?: boolean;
  props?: Partial<TimerProps>;
  session?: Partial<FocusSessionProps>;
}

/**
 * Active blocks (running/paused) started at t0 with 600s left; completed ones have 0.
 * Last activity t0; countdown 4 when a session is attached.
 */
export const timer = (status: TimerStatus, fixture: TimerFixture = {}) => {
  const idle = status === "idle";
  const withSession = fixture.hasSession ?? !idle;
  return Timer.rehydrate(
    {
      id: "t1",
      userId: "u1",
      status,
      mode: idle ? null : (fixture.mode ?? "focus"),
      transitionedAt: idle ? null : t0,
      remainingAtTransition: idle ? null : status === "completed" ? 0 : 600,
      focusBlocksUntilLongBreak: withSession ? 4 : null,
      lastActivityAt: withSession ? t0 : null,
      createdAt: t0,
      updatedAt: t0,
      ...fixture.props,
    },
    withSession ? session(fixture.session) : null,
    1,
  );
};

export const run = (
  t: Timer,
  command: TimerCommand,
  mode?: TimerMode,
  now = at(10),
) => t.execute({ command, mode }, SETTINGS, now);

export const errorCode = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
};

export const transitionedEvents = (events: TimerEvent[]) =>
  events.filter((e): e is TimerTransitioned => e.type === "timer_transitioned");

export const sessionEndedEvents = (events: TimerEvent[]) =>
  events.filter(
    (e): e is FocusSessionEnded => e.type === "focus_session_ended",
  );

export const transitions = (t: Timer) =>
  transitionedEvents(t.pullEvents()).map((e) => e.transition);
