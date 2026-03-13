import { AsksynkError } from "@/api/common/errors/errors.model";

/**
 * Parses an ISO 8601 string with offset (e.g. "2026-03-15T10:00:00+02:00")
 * and returns a Date whose UTC value encodes the wall-clock digits verbatim.
 * e.g. 10:00 +02:00 → stored as 2026-03-15T10:00:00Z (not 08:00Z).
 * This is the correct representation for TIMESTAMP WITHOUT TIME ZONE in Postgres.
 */
export function parseIsoToWallClock(iso: string): Date {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) {
    throw AsksynkError.badRequest(`Invalid ISO 8601 date: ${iso}`);
  }
  const [, year, month, day, hour, minute, second] = match.map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

/**
 * Parses compact ISO format used in URL params: "20260315T100000"
 */
export function parseIsoCompact(compact: string): Date {
  const match = compact.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!match) {
    throw AsksynkError.badRequest(`Invalid compact date: ${compact}`);
  }
  const [, year, month, day, hour, minute, second] = match.map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

export function isValidIanaTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Converts a wall-clock Date (UTC digits = wall-clock digits) + IANA timezone
 * to an ISO 8601 string with offset, e.g. "2026-03-15T10:00:00+02:00".
 */
export function wallClockToIso(wallClock: Date, timezone: string): string {
  const year = wallClock.getUTCFullYear();
  const month = wallClock.getUTCMonth() + 1;
  const day = wallClock.getUTCDate();
  const hour = wallClock.getUTCHours();
  const minute = wallClock.getUTCMinutes();
  const second = wallClock.getUTCSeconds();

  // Get the UTC offset for this wall-clock time in the given timezone.
  // We use Intl to format the approximate UTC instant (which has same digits as UTC)
  // and extract the timezone offset.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(wallClock);
  const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  const offset = parseOffsetString(offsetPart);

  return (
    pad(year, 4) +
    "-" +
    pad(month, 2) +
    "-" +
    pad(day, 2) +
    "T" +
    pad(hour, 2) +
    ":" +
    pad(minute, 2) +
    ":" +
    pad(second, 2) +
    formatOffset(offset)
  );
}

function parseOffsetString(offsetStr: string): number {
  const match = offsetStr.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!match) return 0;
  const sign = match[1] === "+" ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3] ?? "0", 10);
  return sign * (hours * 60 + minutes);
}

function formatOffset(offsetMinutes: number): string {
  if (offsetMinutes === 0) return "+00:00";
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${pad(h, 2)}:${pad(m, 2)}`;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

/**
 * TODO: maybe we should use actual library for validations ??? like rrule.js or something like that,
 * to be sure we cover all edge cases and also support more complex rules in the future if needed ?
 *
 * Validates an rrule string:
 * - Must not use COUNT
 * - Must have UNTIL
 * - UNTIL must be ≤ maxMonths from start
 * - Embeds TZID=<timezone> if not present
 * Returns the normalized rrule string.
 */
export function validateAndNormalizeRrule(
  rrule: string,
  timezone: string,
  start: Date,
  maxMonths = 6,
): string {
  if (/COUNT=/i.test(rrule)) {
    throw AsksynkError.badRequest("rrule must use UNTIL, not COUNT");
  }

  const untilMatch = rrule.match(/UNTIL=([^;]+)/i);
  if (!untilMatch) {
    throw AsksynkError.badRequest("rrule must include UNTIL");
  }

  const until = parseRruleUntil(untilMatch[1]);
  if (!until) {
    throw AsksynkError.badRequest("rrule UNTIL is not a valid date");
  }

  const maxUntil = new Date(start);
  maxUntil.setUTCMonth(maxUntil.getUTCMonth() + maxMonths);
  if (until > maxUntil) {
    throw AsksynkError.badRequest(
      `rrule UNTIL must be within ${maxMonths} months of start`,
    );
  }

  if (!/TZID=/i.test(rrule)) {
    return `${rrule};TZID=${timezone}`;
  }

  return rrule;
}

export function replaceRruleUntil(rrule: string, newUntil: Date): string {
  const untilStr = formatRruleUntil(newUntil);
  return rrule.replace(/UNTIL=[^;]+/i, `UNTIL=${untilStr}`);
}

function parseRruleUntil(untilStr: string): Date | null {
  const match = untilStr
    .trim()
    .match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!match) return null;
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
