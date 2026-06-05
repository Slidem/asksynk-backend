import type { Db, JobInsert, JobWithMetadata } from "pg-boss";

export type MessageHandler<T> = (
  data: T,
  job: JobWithMetadata<T>,
) => Promise<void>;

/** A JobInsert tagged with its target queue (pg-boss v12 insert() is per-queue). */
export type QueuedJobInsert = { name: string } & JobInsert;

export type SendOptions = {
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
  startAfter?: number | Date | string;
  expireInSeconds?: number;
  priority?: number;
  singletonKey?: string;
  singletonSeconds?: number;
  /** Run the insert on a caller-supplied connection/tx (e.g. `fromDrizzle(tx, sql)`). */
  db?: Db;
};

/** Run cancel on a caller-supplied connection/tx so it joins the caller's transaction. */
export type CancelOptions = { db?: Db };

export type WorkOptions = {
  pollingIntervalSeconds?: number;
  batchSize?: number;
  localConcurrency?: number;
};
