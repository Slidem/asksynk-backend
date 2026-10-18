import {
  AllowedCommand,
  BREAK_MODES,
  TIMER_MODES,
  TimerCommand,
  TimerMode,
  TimerStatus,
  TimerTrigger,
} from "@/api/focus/domain/timer.model";

export type SessionPresence = "none" | "attached";
export type SessionEffect = "create" | "keep" | "end";
export type BlockEffect = "start" | "skip" | "abandon" | "complete" | "none";

export type TransitionOn =
  | { command: TimerCommand; modes?: readonly TimerMode[] }
  | { trigger: TimerTrigger };

/**
 * One allowed transition. Fully enumerated (no rule DSL): clients match fields.
 * Omitted `session` / `fromModes` match anything.
 */
export interface TimerTransitionRule {
  from: TimerStatus;
  session?: SessionPresence;
  fromModes?: readonly TimerMode[];
  on: TransitionOn;
  to: TimerStatus;
  sessionEffect: SessionEffect;
  blockEffect: BlockEffect;
  noop?: true;
}

/** What a rule is matched against. */
export interface TimerState {
  status: TimerStatus;
  hasSession: boolean;
  mode: TimerMode | null;
}

const FOCUS = ["focus"] as const;

/**
 * The timer state machine. Single source of truth: `Timer` enforces it, and it is
 * exposed as-is (`GET /timers/transitions`) and per state (`allowedCommands`).
 */
// prettier-ignore
export const TIMER_TRANSITION_RULES: readonly TimerTransitionRule[] = [
  // idle, no session: a new session always starts with focus
  { from: "idle", session: "none", on: { command: "start", modes: FOCUS }, to: "running", sessionEffect: "create", blockEffect: "start" },
  { from: "idle", session: "none", on: { command: "reset" }, to: "idle", sessionEffect: "keep", blockEffect: "none", noop: true },
  // idle, session attached (after a stop)
  { from: "idle", session: "attached", on: { command: "start", modes: TIMER_MODES }, to: "running", sessionEffect: "keep", blockEffect: "start" },
  { from: "idle", session: "attached", on: { command: "reset" }, to: "idle", sessionEffect: "end", blockEffect: "none" },
  // running: skip only between focus and a break
  { from: "running", fromModes: FOCUS, on: { command: "start", modes: BREAK_MODES }, to: "running", sessionEffect: "keep", blockEffect: "skip" },
  { from: "running", fromModes: BREAK_MODES, on: { command: "start", modes: FOCUS }, to: "running", sessionEffect: "keep", blockEffect: "skip" },
  { from: "running", on: { command: "pause" }, to: "paused", sessionEffect: "keep", blockEffect: "none" },
  { from: "running", on: { command: "stop" }, to: "idle", sessionEffect: "keep", blockEffect: "abandon" },
  { from: "running", on: { command: "reset" }, to: "idle", sessionEffect: "end", blockEffect: "abandon" },
  // paused
  { from: "paused", fromModes: FOCUS, on: { command: "start", modes: BREAK_MODES }, to: "running", sessionEffect: "keep", blockEffect: "skip" },
  { from: "paused", fromModes: BREAK_MODES, on: { command: "start", modes: FOCUS }, to: "running", sessionEffect: "keep", blockEffect: "skip" },
  { from: "paused", on: { command: "resume" }, to: "running", sessionEffect: "keep", blockEffect: "none" },
  { from: "paused", on: { command: "stop" }, to: "idle", sessionEffect: "keep", blockEffect: "abandon" },
  { from: "paused", on: { command: "reset" }, to: "idle", sessionEffect: "end", blockEffect: "abandon" },
  // completed
  { from: "completed", on: { command: "start", modes: TIMER_MODES }, to: "running", sessionEffect: "keep", blockEffect: "start" },
  { from: "completed", on: { command: "stop" }, to: "idle", sessionEffect: "keep", blockEffect: "none" },
  { from: "completed", on: { command: "reset" }, to: "idle", sessionEffect: "end", blockEffect: "none" },
  // triggers
  { from: "running", on: { trigger: "timeout" }, to: "completed", sessionEffect: "keep", blockEffect: "complete" },
  { from: "paused", session: "attached", on: { trigger: "inactivity" }, to: "idle", sessionEffect: "end", blockEffect: "abandon" },
  { from: "completed", session: "attached", on: { trigger: "inactivity" }, to: "idle", sessionEffect: "end", blockEffect: "none" },
  { from: "idle", session: "attached", on: { trigger: "inactivity" }, to: "idle", sessionEffect: "end", blockEffect: "none" },
  { from: "running", session: "attached", on: { trigger: "settings_changed" }, to: "idle", sessionEffect: "end", blockEffect: "abandon" },
  { from: "paused", session: "attached", on: { trigger: "settings_changed" }, to: "idle", sessionEffect: "end", blockEffect: "abandon" },
  { from: "completed", session: "attached", on: { trigger: "settings_changed" }, to: "idle", sessionEffect: "end", blockEffect: "none" },
  { from: "idle", session: "attached", on: { trigger: "settings_changed" }, to: "idle", sessionEffect: "end", blockEffect: "none" },
];

function matchesState(rule: TimerTransitionRule, state: TimerState): boolean {
  if (rule.from !== state.status) return false;
  if (rule.session === "none" && state.hasSession) return false;
  if (rule.session === "attached" && !state.hasSession) return false;
  if (rule.fromModes) {
    return state.mode !== null && rule.fromModes.includes(state.mode);
  }
  return true;
}

export function findCommandRule(
  state: TimerState,
  command: TimerCommand,
  mode?: TimerMode,
): TimerTransitionRule | undefined {
  return TIMER_TRANSITION_RULES.find(
    (rule) =>
      matchesState(rule, state) &&
      "command" in rule.on &&
      rule.on.command === command &&
      (rule.on.modes === undefined ||
        (mode !== undefined && rule.on.modes.includes(mode))),
  );
}

export function findTriggerRule(
  state: TimerState,
  trigger: TimerTrigger,
): TimerTransitionRule | undefined {
  return TIMER_TRANSITION_RULES.find(
    (rule) =>
      matchesState(rule, state) &&
      "trigger" in rule.on &&
      rule.on.trigger === trigger,
  );
}

/** Commands with a non-noop rule from `state`; `start` modes merged. */
export function allowedCommands(state: TimerState): AllowedCommand[] {
  const allowed: AllowedCommand[] = [];
  for (const rule of TIMER_TRANSITION_RULES) {
    if (rule.noop || !("command" in rule.on) || !matchesState(rule, state)) {
      continue;
    }
    const { command, modes } = rule.on;
    const existing = allowed.find((a) => a.command === command);
    if (!existing) {
      allowed.push(modes ? { command, modes: [...modes] } : { command });
    } else if (modes) {
      existing.modes = [...new Set([...(existing.modes ?? []), ...modes])];
    }
  }
  return allowed;
}
