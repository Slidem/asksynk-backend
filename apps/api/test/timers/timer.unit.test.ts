import {
  assertValidTransitionInput,
  Timer,
  TimerProps,
} from "@/api/timers/domain/timer";
import { TimerStatus } from "@/api/timers/models/timer.model";

const t0 = new Date("2026-01-01T10:00:00Z");
const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);

const timer = (status: TimerStatus, props: Partial<TimerProps> = {}) =>
  Timer.create({
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
  });

const errorCode = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
};

const focus = { sessionType: "focus" as const, durationSeconds: 1500 };

describe("Timer", () => {
  describe("start", () => {
    it.each<TimerStatus>(["idle", "paused", "completed", "stopped"])(
      "starts from %s without completing anything",
      (status) => {
        expect(timer(status).start(focus)).toEqual({
          type: "started",
          session: focus,
          resetFocusCounter: false,
          completesCurrent: false,
        });
      },
    );

    it("completes the current session when switching from running", () => {
      expect(timer("running").start(focus).completesCurrent).toBe(true);
    });

    it("resets the focus counter for a long break", () => {
      const transition = timer("idle").start({
        sessionType: "long_break",
        durationSeconds: 900,
      });
      expect(transition.resetFocusCounter).toBe(true);
    });
  });

  describe("pause", () => {
    it("pauses a running timer with the live remaining seconds", () => {
      expect(timer("running").pause(at(100))).toEqual({
        type: "paused",
        remainingSeconds: 500,
      });
    });

    it("completes instead when already due", () => {
      expect(timer("running").pause(at(600))).toEqual({
        type: "completed",
        transitionedAt: t0,
      });
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
    it("resumes a paused timer", () => {
      expect(timer("paused").resume()).toEqual({ type: "resumed" });
    });

    it.each<TimerStatus>(["idle", "running", "completed", "stopped"])(
      "rejects resuming when %s",
      (status) => {
        expect(errorCode(() => timer(status).resume())).toBe(
          "timers.timer_not_paused",
        );
      },
    );
  });

  describe("stop", () => {
    it("stops a running timer with the live remaining seconds", () => {
      expect(timer("running").stop(at(100))).toEqual({
        type: "stopped",
        remainingSeconds: 500,
      });
    });

    it("stops a paused timer with its frozen remaining seconds", () => {
      expect(timer("paused").stop(at(100))).toEqual({
        type: "stopped",
        remainingSeconds: 600,
      });
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
    it("completes a running timer", () => {
      expect(timer("running").complete()).toEqual({
        type: "completed",
        transitionedAt: t0,
      });
    });

    it.each<TimerStatus>(["idle", "paused", "completed", "stopped"])(
      "rejects completing when %s",
      (status) => {
        expect(errorCode(() => timer(status).complete())).toBe(
          "timers.timer_not_running",
        );
      },
    );
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
