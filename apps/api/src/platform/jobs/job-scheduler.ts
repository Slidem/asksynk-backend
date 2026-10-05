import { JobPayload, QueuedJobDef } from "@/api/platform/jobs/job.types";

export abstract class JobScheduler {
  /**
   * Schedule `job` to run at `runAt` (default: now). Idempotent per
   * (job, id): a repeat is a no-op. Joins the caller's tx if active.
   *
   * An id identifies one occurrence and must never be reused: a finished row
   * keeps its id for `deleteAfterSeconds`, and scheduling it again meanwhile
   * silently does nothing. Derive ids from domain state that changes on every
   * occurrence, e.g. `transitionedAt`.
   */
  abstract schedule<T extends JobPayload>(
    job: QueuedJobDef<T>,
    payload: NoInfer<T>,
    opts: { id: string; runAt?: Date },
  ): Promise<void>;

  /** Best-effort; missing/finished ids are a no-op. Joins the caller's tx. */
  abstract cancel<T extends JobPayload>(
    job: QueuedJobDef<T>,
    id: string,
  ): Promise<void>;
}
