import { FocusSession } from "@/api/focus/domain/focus-session";
import { Timer } from "@/api/focus/domain/timer";
import {
  TIMER_COMMANDS,
  TIMER_MODES,
  TIMER_STATUSES,
  TIMER_TRIGGER_ORDER,
  TIMER_TRIGGERS,
} from "@/api/focus/domain/timer.model";
import { TimerTransitionRule } from "@/api/focus/domain/timer-transition-rules";
import { UserTimerSettings } from "@/api/focus/domain/user-timer-settings";
import {
  FocusSessionResponse,
  TimerResponse,
} from "@/api/focus/presentation/rest/responses/timer.response";
import { TimerSettingsResponse } from "@/api/focus/presentation/rest/responses/timer-settings.response";
import {
  TimerTransitionResponse,
  TimerTransitionsResponse,
} from "@/api/focus/presentation/rest/responses/timer-transitions.response";

export function toTimerResponse(timer: Timer, now: Date): TimerResponse {
  const completesAt = timer.completesAt();
  return {
    id: timer.id,
    userId: timer.userId,
    status: timer.status,
    mode: timer.mode,
    blockDurationSeconds: timer.blockDurationSeconds(),
    remainingSeconds: timer.remainingSeconds(now),
    completesAt: completesAt ? completesAt.toISOString() : null,
    transitionedAt: timer.transitionedAt?.toISOString() ?? null,
    lastActivityAt: timer.lastActivityAt?.toISOString() ?? null,
    suggestedNextMode: timer.suggestedNextMode(),
    allowedCommands: timer.allowedCommands(),
    focusBlocksUntilLongBreak: timer.focusBlocksUntilLongBreak,
    session: timer.session ? toFocusSessionResponse(timer.session) : null,
    createdAt: timer.createdAt.toISOString(),
    updatedAt: timer.updatedAt.toISOString(),
  };
}

function toFocusSessionResponse(session: FocusSession): FocusSessionResponse {
  return {
    id: session.id,
    startedAt: session.startedAt.toISOString(),
    completedFocusBlocks: session.completedFocusBlocks,
    shortBreaks: session.shortBreaks,
    longBreaks: session.longBreaks,
    settings: session.settings,
  };
}

export function toTimerSettingsResponse(
  settings: UserTimerSettings,
): TimerSettingsResponse {
  return {
    focusDurationSeconds: settings.focusDurationSeconds,
    shortBreakDurationSeconds: settings.shortBreakDurationSeconds,
    longBreakDurationSeconds: settings.longBreakDurationSeconds,
    longBreakInterval: settings.longBreakInterval,
    inactivityTimeoutSeconds: settings.inactivityTimeoutSeconds,
  };
}

export function toTimerTransitionsResponse(
  rules: readonly TimerTransitionRule[],
): TimerTransitionsResponse {
  return {
    statuses: [...TIMER_STATUSES],
    modes: [...TIMER_MODES],
    commands: [...TIMER_COMMANDS],
    triggers: [...TIMER_TRIGGERS],
    triggerOrder: [...TIMER_TRIGGER_ORDER],
    transitions: rules.map(toTimerTransitionResponse),
  };
}

function toTimerTransitionResponse(
  rule: TimerTransitionRule,
): TimerTransitionResponse {
  return {
    from: rule.from,
    ...(rule.session && { session: rule.session }),
    ...(rule.fromModes && { fromModes: [...rule.fromModes] }),
    on:
      "command" in rule.on
        ? {
            command: rule.on.command,
            ...(rule.on.modes && { modes: [...rule.on.modes] }),
          }
        : { trigger: rule.on.trigger },
    to: rule.to,
    sessionEffect: rule.sessionEffect,
    blockEffect: rule.blockEffect,
    ...(rule.noop && { noop: true }),
  };
}
