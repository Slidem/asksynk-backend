import { DomainError } from "@/api/kernel/errors/domain-errors";
import {
  formatDateInTimezone,
  zonedDateToUtc,
} from "@/api/scheduling/domain/zoned-date";

// Europe/Bucharest 2026: EET (+02) → EEST (+03) on Mar 29, back on Oct 25.
const BUCHAREST = "Europe/Bucharest";

describe("zonedDateToUtc", () => {
  it.each([
    ["2026-03-15", BUCHAREST, "2026-03-14T22:00:00Z"],
    ["2026-07-04", BUCHAREST, "2026-07-03T21:00:00Z"],
    ["2026-10-25", BUCHAREST, "2026-10-24T21:00:00Z"],
    ["2026-10-26", BUCHAREST, "2026-10-25T22:00:00Z"],
    ["2026-11-01", "America/New_York", "2026-11-01T04:00:00Z"],
    ["2026-07-04", "Asia/Kathmandu", "2026-07-03T18:15:00Z"],
    ["2026-01-01", "Pacific/Auckland", "2025-12-31T11:00:00Z"],
    ["2026-07-04", "UTC", "2026-07-04T00:00:00Z"],
  ])("%s in %s → %s", (date, tz, utc) => {
    expect(zonedDateToUtc(date, tz)).toEqual(new Date(utc));
  });

  // Asia/Beirut springs forward at 00:00 → 01:00 (2026-03-29): midnight does
  // not exist, so the day starts at 01:00 local (+03) = 22:00Z.
  it("shifts a nonexistent midnight forward", () => {
    expect(zonedDateToUtc("2026-03-29", "Asia/Beirut")).toEqual(
      new Date("2026-03-28T22:00:00Z"),
    );
  });

  it.each(["2026-3-15", "2026-03-15T00:00:00", "tomorrow"])(
    "rejects %s",
    (date) => {
      expect(() => zonedDateToUtc(date, BUCHAREST)).toThrow(DomainError);
    },
  );
});

describe("formatDateInTimezone", () => {
  it.each([
    ["2026-11-01T22:00:00Z", BUCHAREST, "2026-11-02"],
    ["2026-11-01T21:59:59Z", BUCHAREST, "2026-11-01"],
    ["2026-11-01T22:00:00Z", "UTC", "2026-11-01"],
  ])("%s in %s → %s", (utc, tz, date) => {
    expect(formatDateInTimezone(new Date(utc), tz)).toBe(date);
  });

  it.each([
    ["2026-10-25", BUCHAREST],
    ["2026-03-29", BUCHAREST],
    ["2026-11-01", "America/New_York"],
  ])("round-trips %s in %s", (date, tz) => {
    expect(formatDateInTimezone(zonedDateToUtc(date, tz), tz)).toBe(date);
  });
});
