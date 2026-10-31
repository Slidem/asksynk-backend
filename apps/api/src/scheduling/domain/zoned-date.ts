import { invalidValueError } from "@/api/kernel/errors/kernel.errors";

/**
 * All-day dates are calendar dates in the event's timezone, stored as the
 * UTC instant of that local midnight.
 * e.g. "2026-11-02" + "Europe/Bucharest" → 2026-11-01T22:00:00Z
 */
export function zonedDateToUtc(date: string, timezone: string): Date {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw invalidValueError(`Invalid date (expected YYYY-MM-DD): ${date}`);
  }
  const [, year, month, day] = match.map(Number);

  // Estimate by treating midnight as UTC, then correct using the actual offset.
  const estimatedUtc = Date.UTC(year, month - 1, day);
  const offsetMs = getUtcOffsetMs(new Date(estimatedUtc), timezone);
  const corrected = new Date(estimatedUtc - offsetMs);
  // Re-check offset at corrected time to handle DST edges
  const offsetMs2 = getUtcOffsetMs(corrected, timezone);
  if (offsetMs !== offsetMs2) {
    return new Date(estimatedUtc - offsetMs2);
  }
  return corrected;
}

/** UTC instant → "YYYY-MM-DD" calendar date in the timezone. */
export function formatDateInTimezone(utc: Date, timezone: string): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(utc);
}

function getUtcOffsetMs(utc: Date, timezone: string): number {
  const offsetPart =
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "shortOffset",
    })
      .formatToParts(utc)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  return parseOffsetMinutes(offsetPart) * 60 * 1000;
}

function parseOffsetMinutes(offsetStr: string): number {
  const match = offsetStr.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!match) return 0;
  const sign = match[1] === "+" ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3] ?? "0", 10);
  return sign * (hours * 60 + minutes);
}
