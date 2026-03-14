import { AsksynkError } from "@/api/common/errors/errors.model";

/**
 * Extracts wall-clock digits from an ISO 8601 string (ignores offset),
 * interprets them in the given IANA timezone, returns the true UTC instant.
 * Timezone is the source of truth — offset in the ISO string is ignored.
 * e.g. "2026-03-15T10:00:00+05:30" + "Europe/Bucharest" → 2026-03-15T08:00:00Z
 */
export function parseIsoWallClockInTimezone(
  iso: string,
  timezone: string,
): Date {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) {
    throw AsksynkError.badRequest(`Invalid ISO 8601 date: ${iso}`);
  }
  const [, year, month, day, hour, minute, second] = match.map(Number);
  return wallClockPartsToUtc(year, month, day, hour, minute, second, timezone);
}

function wallClockPartsToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timezone: string,
): Date {
  // Estimate UTC by treating digits as UTC, then correct using the actual offset.
  const estimatedUtc = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second),
  );
  const offsetMs = getUtcOffsetMs(estimatedUtc, timezone);
  const corrected = new Date(estimatedUtc.getTime() - offsetMs);
  // Re-check offset at corrected time to handle DST edges
  const offsetMs2 = getUtcOffsetMs(corrected, timezone);
  if (offsetMs !== offsetMs2) {
    return new Date(estimatedUtc.getTime() - offsetMs2);
  }
  return corrected;
}

function getUtcOffsetMs(utc: Date, timezone: string): number {
  const offsetPart =
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "shortOffset",
    })
      .formatToParts(utc)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  return parseOffsetString(offsetPart) * 60 * 1000;
}

export function isIsoDateWithOffset(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/.test(value)) {
    return false;
  }
  return !isNaN(new Date(value).getTime());
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
 * Converts a true UTC Date + IANA timezone to an ISO 8601 string with offset,
 * e.g. "2026-03-15T10:00:00+02:00".
 */
export function utcToIso(utc: Date, timezone: string): string {
  // Get local date parts in the given timezone
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(utc);

  const get = (type: string) =>
    dateParts.find((p) => p.type === type)?.value ?? "00";

  const offsetPart =
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "shortOffset",
    })
      .formatToParts(utc)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  const offset = parseOffsetString(offsetPart);

  return (
    get("year") +
    "-" +
    get("month") +
    "-" +
    get("day") +
    "T" +
    get("hour") +
    ":" +
    get("minute") +
    ":" +
    get("second") +
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
