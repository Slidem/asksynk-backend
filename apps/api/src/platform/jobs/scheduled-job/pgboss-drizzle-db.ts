import { sql } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Db } from "pg-boss";

/**
 * pg-boss `Db` over a drizzle tx that binds `$N` values as single parameters.
 *
 * pg-boss ships its own `fromDrizzle`, but it interpolates raw values straight
 * into drizzle's `sql` tag, and drizzle SPREADS an interpolated JS array into a
 * `(a, b, ...)` list of separate params. pg-boss's cancel/complete/fail pass id
 * arrays for casts like `UNNEST($2::uuid[])`, so the cast then receives a bare
 * scalar and Postgres throws 22P02 ("malformed array literal"), aborting the
 * caller's transaction. Wrapping each value in `sql.param()` binds an array as
 * one value (node-postgres serialises it to `{...}`); scalars are unaffected.
 */
export function fromDrizzleTx(tx: NodePgDatabase): Db {
  return {
    async executeSql(text: string, values: unknown[] = []) {
      const { parts, reordered } = splitPlaceholders(text, values);
      const strings = Object.assign([...parts], { raw: [...parts] });
      return tx.execute(sql(strings, ...reordered.map((v) => sql.param(v))));
    },
  };
}

/** Split `$N` placeholders into literal parts + values in textual order (repeats duplicated). */
function splitPlaceholders(text: string, values: unknown[]) {
  const parts: string[] = [];
  const reordered: unknown[] = [];
  const re = /\$(\d+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    parts.push(text.slice(last, match.index));
    reordered.push(values[Number(match[1]) - 1]);
    last = re.lastIndex;
  }
  parts.push(text.slice(last));
  return { parts, reordered };
}
