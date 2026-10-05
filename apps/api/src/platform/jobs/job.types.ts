export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json | undefined };

/** JSON-safe payload. `Date` is rejected at compile time: use ISO strings. */
export type JobPayload = { [key: string]: Json | undefined };
export type EmptyPayload = Record<string, never>;

export interface JobOptions {
  retryLimit: number;
  retryDelaySeconds: number;
  retryBackoff: boolean;
  expireInSeconds: number;
  /** How long a finished job row (and so its id) is kept. */
  deleteAfterSeconds: number;
  pollingIntervalSeconds: number;
  concurrency: number;
}

interface BaseJobDef<T extends JobPayload> {
  readonly name: string;
  readonly options: JobOptions;
  /** Phantom: carries the payload type, never set at runtime. */
  readonly _payload?: T;
}

export interface QueuedJobDef<T extends JobPayload> extends BaseJobDef<T> {
  readonly kind: "queued";
}

export interface CronJobDef extends BaseJobDef<EmptyPayload> {
  readonly kind: "cron";
  readonly cron: string;
}

export type JobDef<T extends JobPayload = JobPayload> =
  | QueuedJobDef<T>
  | CronJobDef;

export interface JobContext {
  /** Caller-supplied id for queued jobs; pg-boss job id for cron runs. */
  jobId: string;
  /** 1-based. */
  attempt: number;
}

export type JobHandlerFn<T extends JobPayload> = (
  payload: T,
  ctx: JobContext,
) => Promise<void>;

export type JobHandlerMeta = { propertyKey: string; job: JobDef };

/** Stored pg-boss data for queued jobs. */
export type JobEnvelope<T extends JobPayload = JobPayload> = {
  id: string;
  payload: T;
};
