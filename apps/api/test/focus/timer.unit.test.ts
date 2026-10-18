import {
  assertValidTransitionInput,
  Timer,
  TimerProps,
} from "@/api/focus/domain/timer";
import { TimerTransitioned } from "@/api/focus/domain/timer.events";
import { TimerStatus } from "@/api/focus/domain/timer.model";

const t0 = new Date("2026-01-01T10:00:00Z");
const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);

// Non-idle fixtures: a focus session of 1500s, 600s left as of t0.
const timer = (status: TimerStatus, props: Partial<TimerProps> = {}) =>
  Timer.rehydrate(
    {
      id: "t1",
      userId: "u1",
      status,
      sessionType: status === "idle" ? null : "focus",
      sessionDurationSeconds: status === "idle" ? null : 1500,
      transitionedAt: status === "idle" ? null : t0,
      remainingAtTransition: status === "idle" ? null : 600,
      completedFocusSessions: 0,
      createdAt: t0,
      updatedAt: t0,
      ...props,
    },
    1,
  );

const errorCode = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
};

const transitions = (t: Timer) =>
  t.pullEvents().map((e: TimerTransitioned) => e.transition);

const focus = { sessionType: "focus" as const, durationSeconds: 1500 };

describe("Timer", () => {
  describe("start", () => {
    it.each<TimerStatus>(["idle", "paused", "completed", "stopped"])(
      "starts from %s without completing anything",
      (status) => {
        const t = timer(status);
        t.start(focus, at(10));

        expect(t.status).toBe("running");
        expect(t.sessionType).toBe("focus");
        expect(t.sessionDurationSeconds).toBe(1500);
        expect(t.remainingAtTransition).toBe(1500);
        expect(t.transitionedAt).toEqual(at(10));
        expect(t.updatedAt).toEqual(at(10));
        expect(t.completedFocusSessions).toBe(0);
        expect(t.pullEvents()).toEqual([
          {
            transition: "started",
            userId: "u1",
            sessionType: "focus",
            sessionDurationSeconds: 1500,
            remainingSeconds: 1500,
            occurredAt: at(10),
          },
        ]);
      },
    );

    it("completes the current session first when switching from running", () => {
      const t = timer("running");
      t.start({ sessionType: "short_break", durationSeconds: 300 }, at(10));

      expect(t.completedFocusSessions).toBe(1);
      expect(t.sessionType).toBe("short_break");
      expect(transitions(t)).toEqual(["completed", "started"]);
    });

    it("resets the focus counter for a long break, after counting the switched-from focus", () => {
      const t = timer("running", { completedFocusSessions: 3 });
      t.start({ sessionType: "long_break", durationSeconds: 900 }, at(10));
      expect(t.completedFocusSessions).toBe(0);
    });
  });

  describe("pause", () => {
    it("pauses a running timer, freezing the live remaining seconds", () => {
      const t = timer("running");
      t.pause(at(100));

      expect(t.status).toBe("paused");
      expect(t.remainingAtTransition).toBe(500);
      expect(t.transitionedAt).toEqual(at(100));
      expect(t.pullEvents()).toEqual([
        expect.objectContaining({ transition: "paused", remainingSeconds: 500 }),
      ]);
    });

    it("completes instead when already due", () => {
      const t = timer("running");
      t.pause(at(600));

      expect(t.status).toBe("completed");
      expect(t.remainingAtTransition).toBe(0);
      expect(t.completedFocusSessions).toBe(1);
      expect(transitions(t)).toEqual(["completed"]);
    });

    it.each<TimerStatus>(["idle", "paused", "completed", "stopped"])(
      "rejects pausing when %s",
      (status) => {
        expect(errorCode(() => timer(status).pause(at(1)))).toBe(
          "timers.timer_not_running",
        );
      },
    );
  });

  describe("resume", () => {
    it("resumes a paused timer with its frozen remaining seconds", () => {
      const t = timer("paused");
      t.resume(at(50));

      expect(t.status).toBe("running");
      expect(t.transitionedAt).toEqual(at(50));
      expect(t.remainingAtTransition).toBe(600);
      expect(t.completesAt()).toEqual(at(650));
      expect(t.pullEvents()).toEqual([
        expect.objectContaining({ transition: "resumed", remainingSeconds: 600 }),
      ]);
    });

    it.each<TimerStatus>(["idle", "running", "completed", "stopped"])(
      "rejects resuming when %s",
      (status) => {
        expect(errorCode(() => timer(status).resume(at(1)))).toBe(
          "timers.timer_not_paused",
        );
      },
    );
  });

  describe("stop", () => {
    it("stops a running timer with the live remaining seconds", () => {
      const t = timer("running");
      t.stop(at(100));

      expect(t.status).toBe("stopped");
      expect(t.remainingAtTransition).toBe(500);
      expect(t.completedFocusSessions).toBe(0);
      expect(t.pullEvents()).toEqual([
        expect.objectContaining({ transition: "stopped", remainingSeconds: 500 }),
      ]);
    });

    it("stops a paused timer with its frozen remaining seconds", () => {
      const t = timer("paused");
      t.stop(at(100));
      expect(t.remainingAtTransition).toBe(600);
    });

    it.each<TimerStatus>(["idle", "completed", "stopped"])(
      "rejects stopping when %s",
      (status) => {
        expect(errorCode(() => timer(status).stop(at(1)))).toBe(
          "timers.no_active_timer",
        );
      },
    );
  });

  describe("complete", () => {
    it("completes a running focus session, counting it and keeping transitionedAt", () => {
      const t = timer("running");
      t.complete(at(600));

      expect(t.status).toBe("completed");
      expect(t.remainingAtTransition).toBe(0);
      expect(t.completedFocusSessions).toBe(1);
      expect(t.transitionedAt).toEqual(t0);
      expect(t.updatedAt).toEqual(at(600));
      expect(t.pullEvents()).toEqual([
        expect.objectContaining({
          transition: "completed",
          remainingSeconds: 0,
          occurredAt: at(600),
        }),
      ]);
    });

    it("does not count a completed break", () => {
      const t = timer("running", { sessionType: "short_break" });
      t.complete(at(600));
      expect(t.completedFocusSessions).toBe(0);
    });

    it.each<TimerStatus>(["idle", "paused", "completed", "stopped"])(
      "rejects completing when %s",
      (status) => {
        expect(errorCode(() => timer(status).complete(at(1)))).toBe(
          "timers.timer_not_running",
        );
      },
    );
  });

  describe("events", () => {
    it("pullEvents empties the recorded events", () => {
      const t = timer("running");
      t.pause(at(100));
      t.pullEvents();
      expect(t.pullEvents()).toEqual([]);
    });

    it("rehydrate records nothing", () => {
      expect(timer("running").pullEvents()).toEqual([]);
    });
  });

  describe("time", () => {
    it("remainingSeconds clamps at 0", () => {
      expect(timer("running").remainingSeconds(at(10_000))).toBe(0);
    });

    it("remainingSeconds is null when idle", () => {
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
  });
});

describe("assertValidTransitionInput", () => {
  it("accepts start, resume, pause, stop", () => {
    expect(() =>
      assertValidTransitionInput({ status: "running", ...focus }),
    ).not.toThrow();
    expect(() => assertValidTransitionInput({ status: "running" })).not.toThrow();
    expect(() => assertValidTransitionInput({ status: "paused" })).not.toThrow();
    expect(() => assertValidTransitionInput({ status: "stopped" })).not.toThrow();
  });

  it("rejects sessionType without durationSeconds", () => {
    expect(
      errorCode(() =>
        assertValidTransitionInput({ status: "running", sessionType: "focus" }),
      ),
    ).toBe("timers.invalid_session_input");
  });

  it("rejects session fields when not starting", () => {
    expect(
      errorCode(() => assertValidTransitionInput({ status: "paused", ...focus })),
    ).toBe("timers.invalid_session_input");
  });
});
