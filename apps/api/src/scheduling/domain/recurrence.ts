import { invalidValueError } from "@/api/kernel/errors/kernel.errors";

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

/**
 * Validates an rrule string (example: "FREQ=WEEKLY;BYDAY=MO;UNTIL=20260315T100000Z") against these rules:
 * - Must not use COUNT
 * - If UNTIL is missing, defaults to start + 1 year
 * - UNTIL must be ≤ maxMonths from start
 * - Strips TZID (the event's timezone is the source of truth)
 * Returns the normalized rrule string.
 */
export function validateAndNormalizeRrule(
  rrule: string,
  start: Date,
  maxMonths = 12,
): string {
  if (/COUNT=/i.test(rrule)) {
    throw invalidValueError("rrule must use UNTIL, not COUNT");
  }

  rrule = stripTzid(rrule);

  const untilMatch = rrule.match(/UNTIL=([^;]+)/i);

  let until: Date;

  if (!untilMatch) {
    const defaultUntil = new Date(start);
    defaultUntil.setUTCFullYear(defaultUntil.getUTCFullYear() + 1);
    until = defaultUntil;
    rrule = `${rrule};UNTIL=${formatRruleUntil(defaultUntil)}`;
  } else {
    const parsed = parseRruleUntil(untilMatch[1]);
    if (!parsed) {
      throw invalidValueError(
        `rrule UNTIL is not a valid date: ${untilMatch[1]}`,
      );
    }
    until = parsed;
  }

  const maxUntil = new Date(start);
  maxUntil.setUTCMonth(maxUntil.getUTCMonth() + maxMonths);

  if (until > maxUntil) {
    throw invalidValueError(
      `rrule UNTIL must be within ${maxMonths} months of start`,
    );
  }

  return rrule;
}

export function replaceRruleUntil(rrule: string, newUntil: Date): string {
  const untilStr = formatRruleUntil(newUntil);
  return rrule.replace(/UNTIL=[^;]+/i, `UNTIL=${untilStr}`);
}

function stripTzid(rrule: string): string {
  return rrule
    .split(";")
    .filter((part) => part && !/^TZID=/i.test(part))
    .join(";");
}

function parseRruleUntil(untilStr: string): Date | null {
  const match = untilStr
    .trim()
    .match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute, second] = match.map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

function formatRruleUntil(date: Date): string {
  return (
    pad(date.getUTCFullYear(), 4) +
    pad(date.getUTCMonth() + 1, 2) +
    pad(date.getUTCDate(), 2) +
    "T" +
    pad(date.getUTCHours(), 2) +
    pad(date.getUTCMinutes(), 2) +
    pad(date.getUTCSeconds(), 2) +
    "Z"
  );
}
