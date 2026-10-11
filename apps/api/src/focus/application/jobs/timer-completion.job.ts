import { defineJob } from "@/api/platform/jobs/define-job";

/** Addressing + staleness token only. `transitionedAt` is the ISO timestamp of the transition the job was scheduled for. */
export type TimerCompletionPayload = { userId: string; transitionedAt: string };

export const TimerCompletionJob = defineJob<TimerCompletionPayload>({
  name: "timer.completion",
});

/** One id per running span: every transition sets a new `transitionedAt`. */
export const timerCompletionJobId = (userId: string, transitionedAt: Date) =>
  `${userId}:${transitionedAt.toISOString()}`;
