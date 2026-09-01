export interface ScheduleJobInput<T extends object> {
  payload: T;
  runAt: Date;
  /**
   * Caller-owned identifier for the job. Backend-agnostic name for the
   * deduplication key — at most one pending job per (queue, jobId).
   */
  jobId?: string;
}

export abstract class ScheduledJobService {
  /**
   * Schedule a job to run at `runAt`. Returns an opaque ref used to cancel it.
   *
   * Transactional: runs in the caller's transaction if one is active
   * (Propagation.Required), otherwise opens a new one. Safe to use in transactions !
   */
  abstract schedule<T extends object>(
    queue: string,
    input: ScheduleJobInput<T>,
  ): Promise<string | null>;

  /**
   * Best-effort cancellation by ref (already-run/missing jobs are a no-op).
   *
   * Transactional: like {@link schedule}, joins the caller's transaction if
   * active, else opens a new one — so the cancel commits/rolls back with it.
   */
  abstract cancel(queue: string, jobId: string): Promise<void>;

  /** Register a handler that runs when a scheduled job on `queue` fires. */
  abstract process<T extends object>(
    queue: string,
    handler: (payload: T) => Promise<void>,
  ): Promise<void>;
}
