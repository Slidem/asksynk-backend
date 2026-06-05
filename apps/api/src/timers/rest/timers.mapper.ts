import { UserTimer } from "@/api/timers/entities/user-timer.entity";
import { UserTimerSettings } from "@/api/timers/entities/user-timer-settings.entity";
import { BreakSuggestion } from "@/api/timers/models/timer.model";
import { BreakSuggestionResponse } from "@/api/timers/rest/responses/break-suggestion.response";
import { TimerResponse } from "@/api/timers/rest/responses/timer.response";
import { TimerSettingsResponse } from "@/api/timers/rest/responses/timer-settings.response";

export function toTimerResponse(timer: UserTimer, now: Date): TimerResponse {
  const completesAt = timer.completesAt();
  return {
    id: timer.id,
    userId: timer.userId,
    status: timer.status,
    sessionType: timer.sessionType,
    sessionDurationSeconds: timer.sessionDurationSeconds,
    remainingSeconds: timer.remainingSeconds(now),
    completesAt: completesAt ? completesAt.toISOString() : null,
    completedFocusSessions: timer.completedFocusSessions,
    transitionedAt: timer.transitionedAt
      ? timer.transitionedAt.toISOString()
      : null,
    createdAt: timer.createdAt.toISOString(),
    updatedAt: timer.updatedAt.toISOString(),
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
  };
}

export function toBreakSuggestionResponse(
  suggestion: BreakSuggestion,
): BreakSuggestionResponse {
  return {
    suggestedSessionType: suggestion.suggestedSessionType,
    completedFocusSessions: suggestion.completedFocusSessions,
    longBreakInterval: suggestion.longBreakInterval,
  };
}
