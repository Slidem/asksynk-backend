import { TimerStatus } from "@/api/focus/domain/timer.model";
import {
  at,
  errorCode,
  run,
  sessionEndedEvents,
  SETTINGS,
  t0,
  timer,
  transitionedEvents,
  transitions,
} from "@/test/focus/timer.fixtures";

const INVALID = "timers.invalid_transition";

describe("Timer", () => {
  describe("start", () => {
    it("opens a session on the first focus start, snapshotting settings", () => {
      const t = timer("idle");
      run(t, "start", "focus", at(10));

      expect(t.status).toBe("running");
      expect(t.mode).toBe("focus");
      expect(t.remainingAtTransition).toBe(1500);
      expect(t.blockDurationSeconds()).toBe(1500);
      expect(t.transitionedAt).toEqual(at(10));
      expect(t.lastActivityAt).toEqual(at(10));
      expect(t.focusBlocksUntilLongBreak).toBe(4);
      expect(t.session).not.toBeNull();
      expect(t.session!.startedAt).toEqual(at(10));
      // The live-only inactivity timeout is not part of the snapshot.
      expect(t.session!.settings).toEqual({
        focusDurationSeconds: 1500,
        shortBreakDurationSeconds: 300,
        longBreakDurationSeconds: 900,
        longBreakInterval: 4,
      });
      expect(t.pullEvents()).toEqual([
        {
          type: "timer_transitioned",
          transition: "started",
          userId: "u1",
          sessionId: t.session!.id,
          mode: "focus",
          durationSeconds: 1500,
          remainingSeconds: 1500,
          reason: null,
          occurredAt: at(10),
        },
      ]);
    });

    it.each(["short_break", "long_break"] as const)(
      "rejects starting a new session with %s",
      (mode) => {
        expect(errorCode(() => run(timer("idle"), "start", mode))).toBe(
          INVALID,
        );
      },
    );

    it("starts any mode from idle when a session is attached, keeping it", () => {
      const t = timer("idle", { hasSession: true });
      run(t, "start", "short_break");

      expect(t.status).toBe("running");
      expect(t.session!.id).toBe("s1");
      expect(t.session!.shortBreaks).toBe(1);
      expect(t.remainingAtTransition).toBe(300);
    });

    it("starts focus again after a completed focus block (skipping the break)", () => {
      const t = timer("completed");
      run(t, "start", "focus");

      expect(t.status).toBe("running");
      expect(t.mode).toBe("focus");
      expect(transitions(t)).toEqual(["started"]);
    });

    it("counts started breaks; a long break resets the countdown, even early", () => {
      const t = timer("completed", { props: { focusBlocksUntilLongBreak: 2 } });
      run(t, "start", "long_break");

      expect(t.session!.longBreaks).toBe(1);
      expect(t.focusBlocksUntilLongBreak).toBe(4);
    });

    it("a short break leaves the countdown alone", () => {
      const t = timer("completed", { props: { focusBlocksUntilLongBreak: 2 } });
      run(t, "start", "short_break");

      expect(t.session!.shortBreaks).toBe(1);
      expect(t.focusBlocksUntilLongBreak).toBe(2);
    });

    it("takes block durations from the session snapshot, not current settings", () => {
      const t = timer("completed", {
        session: {
          settings: {
            focusDurationSeconds: 60,
            shortBreakDurationSeconds: 30,
            longBreakDurationSeconds: 90,
            longBreakInterval: 2,
          },
        },
      });
      run(t, "start", "short_break");
      expect(t.remainingAtTransition).toBe(30);
    });
  });

  describe("skip", () => {
    it("skips a running focus block to a break, counting it like a completion", () => {
      const t = timer("running");
      run(t, "start", "short_break", at(10));

      expect(t.status).toBe("running");
      expect(t.mode).toBe("short_break");
      expect(t.remainingAtTransition).toBe(300);
      expect(t.session!.completedFocusBlocks).toBe(1);
      expect(t.session!.shortBreaks).toBe(1);
      expect(t.focusBlocksUntilLongBreak).toBe(3);
      const events = transitionedEvents(t.pullEvents());
      expect(events.map((e) => e.transition)).toEqual(["skipped", "started"]);
      // The skipped block keeps its real remaining time and mode.
      expect(events[0]).toMatchObject({ mode: "focus", remainingSeconds: 590 });
    });

    it("skips a paused focus block with its frozen remaining time", () => {
      const t = timer("paused");
      run(t, "start", "long_break", at(100));

      const events = transitionedEvents(t.pullEvents());
      expect(events[0]).toMatchObject({
        transition: "skipped",
        remainingSeconds: 600,
      });
      // Decremented by the skip, then reset by the long break.
      expect(t.focusBlocksUntilLongBreak).toBe(4);
      expect(t.session!.longBreaks).toBe(1);
    });

    it("skipping a break counts nothing extra", () => {
      const t = timer("running", { mode: "short_break" });
      run(t, "start", "focus");

      expect(t.session!.completedFocusBlocks).toBe(0);
      expect(t.focusBlocksUntilLongBreak).toBe(4);
      expect(transitions(t)).toEqual(["skipped", "started"]);
    });

    it.each<[TimerStatus, "focus" | "short_break" | "long_break", string]>([
      ["running", "focus", "focus"],
      ["running", "short_break", "long_break"],
      ["running", "long_break", "short_break"],
      ["paused", "focus", "focus"],
      ["paused", "short_break", "short_break"],
    ])("rejects %s %s → %s", (status, mode, next) => {
      expect(
        errorCode(() => run(timer(status, { mode }), "start", next as "focus")),
      ).toBe(INVALID);
    });

    it("a past-due block completes naturally before the next start (never logged skipped)", () => {
      const t = timer("running");
      run(t, "start", "short_break", at(700));

      const events = transitionedEvents(t.pullEvents());
      expect(events.map((e) => e.transition)).toEqual(["completed", "started"]);
      expect(events[0].occurredAt).toEqual(at(600));
      expect(t.session!.completedFocusBlocks).toBe(1);
    });
  });

  describe("pause / resume", () => {
    it("pauses a running block, freezing the live remaining seconds", () => {
      const t = timer("running");
      run(t, "pause", undefined, at(100));

      expect(t.status).toBe("paused");
      expect(t.remainingAtTransition).toBe(500);
      expect(t.transitionedAt).toEqual(at(100));
      expect(t.lastActivityAt).toEqual(at(100));
      expect(t.completesAt()).toBeNull();
      expect(transitionedEvents(t.pullEvents())).toEqual([
        expect.objectContaining({
          transition: "paused",
          remainingSeconds: 500,
        }),
      ]);
    });

    it("a due block completes first, so pausing it is rejected", () => {
      expect(
        errorCode(() => run(timer("running"), "pause", undefined, at(600))),
      ).toBe(INVALID);
    });

    it("resumes a paused block with its frozen remaining seconds", () => {
      const t = timer("paused");
      run(t, "resume", undefined, at(50));

      expect(t.status).toBe("running");
      expect(t.completesAt()).toEqual(at(650));
      expect(transitionedEvents(t.pullEvents())).toEqual([
        expect.objectContaining({
          transition: "resumed",
          remainingSeconds: 600,
        }),
      ]);
    });

    it("resume after the inactivity window hits the reset state", () => {
      const t = timer("paused");
      const twoHours = 2 * 3600;
      expect(errorCode(() => run(t, "resume", undefined, at(twoHours)))).toBe(
        INVALID,
      );
    });
  });

  describe("stop", () => {
    it("abandons a running block; the session stays attached and nothing counts", () => {
      const t = timer("running");
      run(t, "stop", undefined, at(100));

      expect(t.status).toBe("idle");
      expect(t.mode).toBeNull();
      expect(t.remainingAtTransition).toBeNull();
      expect(t.transitionedAt).toBeNull();
      expect(t.session!.id).toBe("s1");
      expect(t.session!.completedFocusBlocks).toBe(0);
      expect(t.focusBlocksUntilLongBreak).toBe(4);
      expect(t.lastActivityAt).toEqual(at(100));
      expect(t.pullEvents()).toEqual([
        expect.objectContaining({
          transition: "stopped",
          mode: "focus",
          remainingSeconds: 500,
          reason: null,
        }),
      ]);
    });

    it("stops a paused block with its frozen remaining seconds", () => {
      const t = timer("paused");
      run(t, "stop");
      expect(transitionedEvents(t.pullEvents())[0].remainingSeconds).toBe(600);
    });

    it("stop on a completed block just goes idle: no event", () => {
      const t = timer("completed");
      run(t, "stop");

      expect(t.status).toBe("idle");
      expect(t.session!.id).toBe("s1");
      expect(t.pullEvents()).toEqual([]);
    });

    it.each([true, false])(
      "rejects stop when idle (session: %s)",
      (hasSession) => {
        expect(
          errorCode(() => run(timer("idle", { hasSession }), "stop")),
        ).toBe(INVALID);
      },
    );
  });

  describe("reset", () => {
    it("is a no-op without a session", () => {
      const t = timer("idle");
      run(t, "reset");

      expect(t.status).toBe("idle");
      expect(t.pullEvents()).toEqual([]);
      expect(t.sessionsToSave()).toEqual([]);
    });

    it("abandons the running block and ends the session", () => {
      const t = timer("running");
      const s = t.session!;
      run(t, "reset", undefined, at(100));

      expect(t.status).toBe("idle");
      expect(t.session).toBeNull();
      expect(t.focusBlocksUntilLongBreak).toBeNull();
      expect(s.finishedAt).toEqual(at(100));
      expect(s.endReason).toBe("manual_reset");
      expect(t.sessionsToSave()).toEqual([s]);

      const events = t.pullEvents();
      expect(transitionedEvents(events)).toEqual([
        expect.objectContaining({
          transition: "stopped",
          remainingSeconds: 500,
          reason: "manual_reset",
        }),
      ]);
      expect(sessionEndedEvents(events)).toEqual([
        {
          type: "focus_session_ended",
          userId: "u1",
          sessionId: "s1",
          reason: "manual_reset",
          finishedAt: at(100),
        },
      ]);
    });

    it.each<[TimerStatus, boolean]>([
      ["idle", true],
      ["completed", true],
    ])(
      "ends the session from %s without a block event",
      (status, hasSession) => {
        const t = timer(status, { hasSession });
        run(t, "reset");

        const events = t.pullEvents();
        expect(transitionedEvents(events)).toEqual([]);
        expect(sessionEndedEvents(events)).toHaveLength(1);
        expect(t.session).toBeNull();
      },
    );

    it("the next start after a reset opens a fresh session", () => {
      const t = timer("completed");
      run(t, "reset");
      run(t, "start", "focus", at(20));

      expect(t.session!.id).not.toBe("s1");
      expect(t.sessionsToSave().map((s) => s.endReason)).toEqual([
        "manual_reset",
        null,
      ]);
    });

    it("markSaved forgets ended sessions", () => {
      const t = timer("completed");
      run(t, "reset");
      t.markSaved();
      expect(t.sessionsToSave()).toEqual([]);
    });
  });

  describe("complete", () => {
    it("completes a focus block: counts it, decrements the countdown, keeps transitionedAt", () => {
      const t = timer("running");
      t.complete(at(600));

      expect(t.status).toBe("completed");
      expect(t.remainingAtTransition).toBe(0);
      expect(t.transitionedAt).toEqual(t0);
      expect(t.session!.completedFocusBlocks).toBe(1);
      expect(t.focusBlocksUntilLongBreak).toBe(3);
      expect(t.lastActivityAt).toEqual(at(600));
    });

    it("a late completion is stamped at the due time", () => {
      const t = timer("running");
      t.complete(at(5000));

      expect(t.lastActivityAt).toEqual(at(600));
      expect(t.updatedAt).toEqual(at(5000));
      expect(transitionedEvents(t.pullEvents())[0].occurredAt).toEqual(at(600));
    });

    it("a completed break counts nothing", () => {
      const t = timer("running", { mode: "short_break" });
      t.complete(at(600));
      expect(t.session!.completedFocusBlocks).toBe(0);
      expect(t.focusBlocksUntilLongBreak).toBe(4);
    });

    it("the countdown stops at 0", () => {
      const t = timer("running", { props: { focusBlocksUntilLongBreak: 0 } });
      t.complete(at(600));
      expect(t.focusBlocksUntilLongBreak).toBe(0);
    });

    it.each<TimerStatus>(["idle", "paused", "completed"])(
      "rejects completing when %s",
      (status) => {
        expect(errorCode(() => timer(status).complete(at(1)))).toBe(INVALID);
      },
    );
  });

  describe("inactivity", () => {
    const timeout = SETTINGS.inactivityTimeoutSeconds;

    it("is inactive only past the timeout", () => {
      expect(timer("paused").isInactive(at(3600), timeout)).toBe(false);
      expect(timer("paused").isInactive(at(3601), timeout)).toBe(true);
    });

    it("is never inactive while running, without a session, or when disabled", () => {
      expect(timer("running").isInactive(at(99_999), timeout)).toBe(false);
      expect(timer("idle").isInactive(at(99_999), timeout)).toBe(false);
      expect(timer("paused").isInactive(at(99_999), null)).toBe(false);
    });

    it("settles a paused session: block logged stopped, session ended at last activity", () => {
      const t = timer("paused");
      const s = t.session!;
      expect(t.settle(at(4000), timeout)).toBe(true);

      expect(t.status).toBe("idle");
      expect(t.session).toBeNull();
      expect(s.finishedAt).toEqual(t0);
      expect(s.endReason).toBe("inactivity");
      expect(t.lastActivityAt).toEqual(t0);
      expect(t.updatedAt).toEqual(at(4000));
      const events = t.pullEvents();
      expect(transitionedEvents(events)).toEqual([
        expect.objectContaining({
          transition: "stopped",
          reason: "inactivity",
          remainingSeconds: 600,
          occurredAt: t0,
        }),
      ]);
      expect(sessionEndedEvents(events)[0]).toMatchObject({
        reason: "inactivity",
        finishedAt: t0,
      });
    });

    it("settles an overdue run: completes it, then ends the session an hour after", () => {
      const t = timer("running");
      t.settle(at(600 + 3601), timeout);

      expect(transitions(t)).toEqual(["completed"]);
      expect(t.status).toBe("idle");
    });

    it("settle reports nothing to do", () => {
      expect(timer("running").settle(at(10), timeout)).toBe(false);
      expect(timer("idle").settle(at(99_999), timeout)).toBe(false);
    });
  });

  describe("applySettingsChange", () => {
    const changed = { ...SETTINGS, focusDurationSeconds: 1200 };

    it("ends the session when a duration or the interval changed", () => {
      const t = timer("running");
      expect(t.applySettingsChange(changed, at(100))).toBe(true);

      expect(t.status).toBe("idle");
      expect(t.session).toBeNull();
      const events = t.pullEvents();
      expect(transitionedEvents(events)).toEqual([
        expect.objectContaining({
          transition: "stopped",
          reason: "settings_changed",
          remainingSeconds: 500,
        }),
      ]);
      expect(sessionEndedEvents(events)[0].reason).toBe("settings_changed");
    });

    it("keeps the session when only the inactivity timeout changed", () => {
      const t = timer("running");
      expect(
        t.applySettingsChange(
          { ...SETTINGS, inactivityTimeoutSeconds: null },
          at(1),
        ),
      ).toBe(false);
      expect(t.session!.id).toBe("s1");
      expect(t.pullEvents()).toEqual([]);
    });

    it("does nothing without a session", () => {
      expect(timer("idle").applySettingsChange(changed, at(1))).toBe(false);
    });
  });

  describe("suggestedNextMode", () => {
    it("suggests focus when idle or after a break", () => {
      expect(timer("idle").suggestedNextMode()).toBe("focus");
      expect(timer("idle", { hasSession: true }).suggestedNextMode()).toBe(
        "focus",
      );
      expect(timer("running", { mode: "long_break" }).suggestedNextMode()).toBe(
        "focus",
      );
    });

    it("suggests a long break when the focus block brings the countdown to 0", () => {
      const running = (n: number) =>
        timer("running", { props: { focusBlocksUntilLongBreak: n } });
      const completed = (n: number) =>
        timer("completed", { props: { focusBlocksUntilLongBreak: n } });

      expect(running(4).suggestedNextMode()).toBe("short_break");
      expect(running(1).suggestedNextMode()).toBe("long_break");
      expect(completed(1).suggestedNextMode()).toBe("short_break");
      expect(completed(0).suggestedNextMode()).toBe("long_break");
    });
  });

  describe("allowedCommands", () => {
    it("lists commands per state, merging start modes and hiding no-op reset", () => {
      expect(timer("idle").allowedCommands()).toEqual([
        { command: "start", modes: ["focus"] },
      ]);
      expect(timer("idle", { hasSession: true }).allowedCommands()).toEqual([
        { command: "start", modes: ["focus", "short_break", "long_break"] },
        { command: "reset" },
      ]);
      expect(timer("running").allowedCommands()).toEqual([
        { command: "start", modes: ["short_break", "long_break"] },
        { command: "pause" },
        { command: "stop" },
        { command: "reset" },
      ]);
      expect(
        timer("paused", { mode: "short_break" }).allowedCommands(),
      ).toEqual([
        { command: "start", modes: ["focus"] },
        { command: "resume" },
        { command: "stop" },
        { command: "reset" },
      ]);
      expect(timer("completed").allowedCommands()).toEqual([
        { command: "start", modes: ["focus", "short_break", "long_break"] },
        { command: "stop" },
        { command: "reset" },
      ]);
    });
  });

  describe("command input", () => {
    it("requires a mode to start", () => {
      expect(errorCode(() => run(timer("idle"), "start"))).toBe(
        "timers.invalid_command_input",
      );
    });

    it("rejects a mode on other commands", () => {
      expect(errorCode(() => run(timer("running"), "pause", "focus"))).toBe(
        "timers.invalid_command_input",
      );
    });
  });

  describe("time", () => {
    it("remainingSeconds clamps at 0 and is null when idle", () => {
      expect(timer("running").remainingSeconds(at(10_000))).toBe(0);
      expect(timer("idle").remainingSeconds(at(1))).toBeNull();
    });

    it("completesAt / isDue only for running", () => {
      expect(timer("running").completesAt()).toEqual(at(600));
      expect(timer("running").isDue(at(599))).toBe(false);
      expect(timer("running").isDue(at(600))).toBe(true);
      expect(timer("paused").completesAt()).toBeNull();
      expect(timer("paused").isDue(at(10_000))).toBe(false);
    });

    it("isRunSpan only for the running span that started at transitionedAt", () => {
      expect(timer("running").isRunSpan(t0)).toBe(true);
      expect(timer("running").isRunSpan(at(1))).toBe(false);
      expect(timer("paused").isRunSpan(t0)).toBe(false);
      expect(timer("completed").isRunSpan(t0)).toBe(false);
    });

    it("rehydrate records nothing; pullEvents empties", () => {
      const t = timer("running");
      expect(t.pullEvents()).toEqual([]);
      run(t, "pause");
      t.pullEvents();
      expect(t.pullEvents()).toEqual([]);
    });
  });
});
