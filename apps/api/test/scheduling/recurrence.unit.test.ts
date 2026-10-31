import { DomainError } from "@/api/kernel/errors/domain-errors";
import {
  replaceRruleUntil,
  validateAndNormalizeRrule,
} from "@/api/scheduling/domain/recurrence";

describe("validateAndNormalizeRrule", () => {
  const start = new Date("2026-03-15T08:00:00Z");

  describe("COUNT", () => {
    // COUNT is banned (series must be bounded by date). Check is
    // case-insensitive.
    it.each(["FREQ=DAILY;COUNT=5", "FREQ=DAILY;count=5"])(
      "rejects %s",
      (rrule) => {
        expect(() => validateAndNormalizeRrule(rrule, start)).toThrow(
          "rrule must use UNTIL, not COUNT",
        );
      },
    );

    // COUNT wins even when UNTIL is also present (RFC 5545 forbids both).
    it("rejects COUNT even with UNTIL", () => {
      expect(() =>
        validateAndNormalizeRrule(
          "FREQ=DAILY;COUNT=5;UNTIL=20260401T000000Z",
          start,
        ),
      ).toThrow(DomainError);
    });
  });

  describe("default UNTIL", () => {
    // Missing UNTIL → start + 1 year in RFC 5545 UTC form.
    it("appends UNTIL = start + 1 year", () => {
      expect(validateAndNormalizeRrule("FREQ=WEEKLY;BYDAY=MO", start)).toBe(
        "FREQ=WEEKLY;BYDAY=MO;UNTIL=20270315T080000Z",
      );
    });

    // Default UNTIL is exactly at the 12-month limit — boundary must be
    // inclusive or every rrule without UNTIL would fail.
    it("default UNTIL sits exactly on the default max and passes", () => {
      expect(() =>
        validateAndNormalizeRrule("FREQ=DAILY", start),
      ).not.toThrow();
    });

    // Feb 29 + 1 year rolls to Mar 1 via setUTCFullYear; max uses
    // setUTCMonth(+12) and also lands on Mar 1, so they still agree.
    it("handles a leap-day start", () => {
      expect(
        validateAndNormalizeRrule(
          "FREQ=YEARLY",
          new Date("2028-02-29T10:00:00Z"),
        ),
      ).toBe("FREQ=YEARLY;UNTIL=20290301T100000Z");
    });

    // UNTIL is formatted with zero-padding and the start's seconds kept.
    it("zero-pads UNTIL parts", () => {
      expect(
        validateAndNormalizeRrule(
          "FREQ=DAILY",
          new Date("2026-01-02T03:04:05.678Z"),
        ),
      ).toBe("FREQ=DAILY;UNTIL=20270102T030405Z");
    });
  });

  describe("explicit UNTIL", () => {
    // Valid UNTIL is preserved verbatim.
    it("keeps a valid UNTIL as-is", () => {
      expect(
        validateAndNormalizeRrule(
          "FREQ=WEEKLY;UNTIL=20260601T000000Z;BYDAY=MO",
          start,
        ),
      ).toBe("FREQ=WEEKLY;UNTIL=20260601T000000Z;BYDAY=MO");
    });

    // Lowercase key and missing trailing Z are both tolerated.
    it.each([
      "FREQ=DAILY;until=20260601T000000Z",
      "FREQ=DAILY;UNTIL=20260601T000000",
    ])("accepts %s", (rrule) => {
      expect(() => validateAndNormalizeRrule(rrule, start)).not.toThrow();
    });

    // Floating UNTIL (no Z) is interpreted as UTC for the limit check:
    // 20270315T080000 == start + 12 months exactly → allowed; +1s → rejected.
    it("treats UNTIL without Z as UTC", () => {
      expect(() =>
        validateAndNormalizeRrule("FREQ=DAILY;UNTIL=20270315T080000", start),
      ).not.toThrow();
      expect(() =>
        validateAndNormalizeRrule("FREQ=DAILY;UNTIL=20270315T080001", start),
      ).toThrow(DomainError);
    });

    // Inclusive boundary: exactly at max passes, one second past fails.
    it("enforces the 12-month limit inclusively", () => {
      expect(() =>
        validateAndNormalizeRrule("FREQ=DAILY;UNTIL=20270315T080000Z", start),
      ).not.toThrow();
      expect(() =>
        validateAndNormalizeRrule("FREQ=DAILY;UNTIL=20270315T080001Z", start),
      ).toThrow("rrule UNTIL must be within 12 months of start");
    });

    // Custom maxMonths is respected and reflected in the error message.
    it("respects a custom maxMonths", () => {
      const rrule = "FREQ=DAILY;UNTIL=20260916T000000Z";
      expect(() => validateAndNormalizeRrule(rrule, start, 6)).toThrow(
        "rrule UNTIL must be within 6 months of start",
      );
      expect(() => validateAndNormalizeRrule(rrule, start, 7)).not.toThrow();
    });

    // Anything not matching YYYYMMDDTHHmmss[Z] is rejected, including the
    // RFC 5545 DATE form (date-only UNTIL), ISO-style dashes, and garbage.
    it.each([
      "20260601",
      "2026-06-01T00:00:00Z",
      "20260601T0000Z",
      "tomorrow",
      "20260601T000000+0200",
    ])("rejects UNTIL=%s", (until) => {
      expect(() =>
        validateAndNormalizeRrule(`FREQ=DAILY;UNTIL=${until}`, start),
      ).toThrow(`rrule UNTIL is not a valid date: ${until}`);
    });
  });

  describe("TZID", () => {
    // The event timezone is the source of truth; TZID (any case, any position) is dropped.
    it.each([
      [
        "FREQ=DAILY;UNTIL=20260601T000000Z;TZID=UTC",
        "FREQ=DAILY;UNTIL=20260601T000000Z",
      ],
      [
        "TZID=Europe/Bucharest;FREQ=DAILY;UNTIL=20260601T000000Z",
        "FREQ=DAILY;UNTIL=20260601T000000Z",
      ],
      [
        "FREQ=DAILY;tzid=UTC;UNTIL=20260601T000000Z",
        "FREQ=DAILY;UNTIL=20260601T000000Z",
      ],
    ])("strips TZID from %s", (rrule, expected) => {
      expect(validateAndNormalizeRrule(rrule, start)).toBe(expected);
    });

    // Idempotent: normalizing an already-normalized rrule is a no-op. The
    // split flow re-validates the stored (normalized) rrule.
    it("is idempotent", () => {
      const once = validateAndNormalizeRrule("FREQ=DAILY", start);
      expect(validateAndNormalizeRrule(once, start)).toBe(once);
    });
  });
});

describe("replaceRruleUntil", () => {
  const newUntil = new Date("2026-05-01T09:08:07.654Z");

  // Only the UNTIL value changes; other parts and their order are kept.
  it.each([
    [
      "FREQ=WEEKLY;UNTIL=20270315T080000Z;BYDAY=MO",
      "FREQ=WEEKLY;UNTIL=20260501T090807Z;BYDAY=MO",
    ],
    [
      "FREQ=WEEKLY;BYDAY=MO;UNTIL=20270315T080000Z",
      "FREQ=WEEKLY;BYDAY=MO;UNTIL=20260501T090807Z",
    ],
  ])("replaces UNTIL in %s", (rrule, expected) => {
    expect(replaceRruleUntil(rrule, newUntil)).toBe(expected);
  });

  // Matches lowercase key, emits canonical uppercase.
  it("matches UNTIL case-insensitively and uppercases it", () => {
    expect(
      replaceRruleUntil("FREQ=DAILY;until=20270315T080000", newUntil),
    ).toBe("FREQ=DAILY;UNTIL=20260501T090807Z");
  });

  // No UNTIL → no-op (does not append). Callers must ensure UNTIL exists,
  // which validateAndNormalizeRrule guarantees for stored rrules.
  it("returns the rrule unchanged when there is no UNTIL", () => {
    expect(replaceRruleUntil("FREQ=DAILY;BYDAY=MO", newUntil)).toBe(
      "FREQ=DAILY;BYDAY=MO",
    );
  });

  // Output must be parseable by validateAndNormalizeRrule (formats agree).
  it("produces an UNTIL that validateAndNormalizeRrule accepts", () => {
    const start = new Date("2026-03-15T08:00:00Z");
    const rrule = replaceRruleUntil(
      "FREQ=DAILY;UNTIL=20270315T080000Z",
      newUntil,
    );
    expect(validateAndNormalizeRrule(rrule, start)).toBe(rrule);
  });
});
