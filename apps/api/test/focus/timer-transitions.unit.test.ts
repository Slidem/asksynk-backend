import { TimerState } from "src/focus/domain/timer.model";
import {
  findCommandRule,
  TIMER_TRANSITION_RULES,
  TimerTransitionRule,
} from "src/focus/domain/timer-transition-rules";

import {
  AllowedCommand,
  TIMER_COMMANDS,
  TIMER_MODES,
  TIMER_STATUSES,
  TimerCommand,
  TimerMode,
  TimerStatus,
} from "@/api/focus/domain/timer.model";
import {
  at,
  errorCode,
  run,
  sessionEndedEvents,
  SETTINGS,
  timer,
  transitionedEvents,
} from "@/test/focus/timer.fixtures";

// Every reachable state: idle with/without session; active states always have one.
const STATES: TimerState[] = TIMER_STATUSES.flatMap<TimerState>((status) =>
  status === "idle"
    ? [
        { status, hasSession: false, mode: null },
        { status, hasSession: true, mode: null },
      ]
    : TIMER_MODES.map((mode) => ({ status, hasSession: true, mode })),
);

const timerIn = (state: TimerState) =>
  timer(state.status, {
    hasSession: state.hasSession,
    ...(state.mode && { mode: state.mode }),
  });

const label = (s: TimerState) =>
  `${s.status}${s.mode ? `/${s.mode}` : ""}${s.hasSession ? "" : " (no session)"}`;

/** States a rule's `from` side matches. */
const statesFor = (rule: TimerTransitionRule) =>
  STATES.filter(
    (s) =>
      s.status === rule.from &&
      (rule.session === undefined ||
        (rule.session === "attached") === s.hasSession) &&
      (rule.fromModes === undefined ||
        (s.mode !== null && rule.fromModes.includes(s.mode))),
  );

/** Asserts the observable effects a rule promises. */
function expectEffects(
  rule: TimerTransitionRule,
  before: { sessionId: string | null },
  t: ReturnType<typeof timer>,
) {
  expect(t.status).toBe(rule.to);

  switch (rule.sessionEffect) {
    case "create":
      expect(before.sessionId).toBeNull();
      expect(t.session).not.toBeNull();
      break;
    case "keep":
      expect(t.session?.id ?? null).toBe(before.sessionId);
      break;
    case "end":
      expect(t.session).toBeNull();
      break;
  }

  const events = t.pullEvents();
  expect(transitionedEvents(events).map((e) => e.transition)).toEqual(
    expectedBlockEvents(rule),
  );
  expect(sessionEndedEvents(events)).toHaveLength(
    rule.sessionEffect === "end" ? 1 : 0,
  );
}

/** Log rows a rule produces. `none` = no block starts or ends (pause/resume still log). */
function expectedBlockEvents(rule: TimerTransitionRule): string[] {
  switch (rule.blockEffect) {
    case "start":
      return ["started"];
    case "skip":
      return ["skipped", "started"];
    case "abandon":
      return ["stopped"];
    case "complete":
      return ["completed"];
    case "none": {
      const command = "command" in rule.on ? rule.on.command : null;
      if (command === "pause") return ["paused"];
      if (command === "resume") return ["resumed"];
      return [];
    }
  }
}

describe("TIMER_TRANSITION_RULES (contract: exposed rules = enforced rules)", () => {
  const commandRules = TIMER_TRANSITION_RULES.filter((r) => "command" in r.on);

  describe("every command rule applies with its promised effects", () => {
    const cases = commandRules.flatMap((rule) => {
      const on = rule.on as { command: TimerCommand; modes?: TimerMode[] };
      const modes: (TimerMode | undefined)[] = on.modes ?? [undefined];
      return statesFor(rule).flatMap((state) =>
        modes.map((mode) => ({
          name: `${label(state)}: ${on.command}${mode ? ` ${mode}` : ""} → ${rule.to}`,
          rule,
          state,
          command: on.command,
          mode,
        })),
      );
    });

    it.each(cases)("$name", ({ rule, state, command, mode }) => {
      const t = timerIn(state);
      const before = { sessionId: t.session?.id ?? null };
      run(t, command, mode, at(10));
      expectEffects(rule, before, t);
    });
  });

  describe("every trigger rule applies with its promised effects", () => {
    const triggerRules = TIMER_TRANSITION_RULES.filter(
      (r) => "trigger" in r.on,
    );

    const cases = triggerRules.flatMap((rule) => {
      const trigger = (rule.on as { trigger: string }).trigger;
      return statesFor(rule).map((state) => ({
        name: `${label(state)}: ${trigger} → ${rule.to}`,
        rule,
        state,
        trigger,
      }));
    });

    it.each(cases)("$name", ({ rule, state, trigger }) => {
      const t = timerIn(state);
      const before = { sessionId: t.session?.id ?? null };

      if (trigger === "timeout") {
        expect(t.settle(at(600), null)).toBe(true);
      } else if (trigger === "inactivity") {
        expect(
          t.settle(
            at(SETTINGS.inactivityTimeoutSeconds! + 1),
            SETTINGS.inactivityTimeoutSeconds,
          ),
        ).toBe(true);
      } else {
        expect(
          t.applySettingsChange({ ...SETTINGS, longBreakInterval: 2 }, at(10)),
        ).toBe(true);
      }
      expectEffects(rule, before, t);
    });
  });

  describe("everything not in the table is rejected, and allowedCommands matches", () => {
    const isListed = (
      allowed: AllowedCommand[],
      command: TimerCommand,
      mode?: TimerMode,
    ) =>
      allowed.some(
        (a) =>
          a.command === command &&
          (mode === undefined || a.modes?.includes(mode)),
      );

    const cases = STATES.flatMap((state) =>
      TIMER_COMMANDS.flatMap((command) =>
        (command === "start" ? [...TIMER_MODES] : [undefined]).map((mode) => ({
          name: `${label(state)}: ${command}${mode ? ` ${mode}` : ""}`,
          state,
          command,
          mode,
        })),
      ),
    );

    it.each(cases)("$name", ({ state, command, mode }) => {
      const rule = findCommandRule(state, command, mode);
      const t = timerIn(state);
      const allowed = t.allowedCommands();
      const code = errorCode(() => run(t, command, mode, at(10)));

      if (!rule) {
        expect(code).toBe("timers.invalid_transition");
        expect(isListed(allowed, command, mode)).toBe(false);
      } else {
        expect(code).toBeUndefined();
        expect(t.status).toBe(rule.to);
        // No-op rows are accepted but not offered.
        expect(isListed(allowed, command, mode)).toBe(!rule.noop);
      }
    });
  });

  it("covers each (state, command) at most once per mode", () => {
    for (const state of STATES) {
      for (const command of TIMER_COMMANDS) {
        for (const mode of command === "start" ? TIMER_MODES : [undefined]) {
          const matches = TIMER_TRANSITION_RULES.filter(
            (r) =>
              "command" in r.on &&
              r.on.command === command &&
              statesFor(r).includes(state) &&
              (r.on.modes === undefined ||
                (mode !== undefined && r.on.modes.includes(mode))),
          );
          expect(matches.length).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("only lists valid statuses", () => {
    const statuses = new Set<TimerStatus>(TIMER_STATUSES);
    for (const rule of TIMER_TRANSITION_RULES) {
      expect(statuses.has(rule.from)).toBe(true);
      expect(statuses.has(rule.to)).toBe(true);
    }
  });
});
