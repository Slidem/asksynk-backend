/**
 * PostgreSQL error codes.
 * @see https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export const PgErrorCode = {
  /** A unique constraint or primary key constraint was violated. */
  UNIQUE_VIOLATION: "23505",
  /** A deadlock was detected; the transaction was chosen as the victim and rolled back. */
  DEADLOCK_DETECTED: "40P01",
} as const;

/**
 * A PostgreSQL error, which may have a `code` property corresponding to one of the `PgErrorCode` values.
 */
export type PgError = { code?: string };
