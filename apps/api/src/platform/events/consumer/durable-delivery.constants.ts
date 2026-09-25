import { Queue } from "pg-boss";

/**
 * Attempts the runtime makes before dead-lettering an event. The terminal
 * attempt writes the dead letter and completes the job, so the key unblocks.
 */
export const MAX_ATTEMPTS = 3;

/**
 * Every consumer-group queue. `retryLimit` equals MAX_ATTEMPTS, i.e. one more
 * pg-boss attempt than the runtime uses: that extra attempt only runs when the
 * terminal one died outside the handler's catch (expired, or worker killed),
 * and the runtime dead-letters it without invoking the handler. pg-boss thus
 * never marks a job `failed`, which would block its key.
 */
export const DURABLE_GROUP_QUEUE_OPTIONS: Omit<Queue, "name"> = {
  policy: "key_strict_fifo",
  retryLimit: MAX_ATTEMPTS,
  retryDelay: 2,
  retryBackoff: true,
  retryDelayMax: 30,
  expireInSeconds: 120,
};
