import {
  parseIsoWallClockInTimezone,
  replaceRruleUntil,
  utcToIso,
  validateAndNormalizeRrule,
} from "@/api/calendar-events/domain/recurrence";
import { DomainError } from "@/api/kernel/errors/domain-errors";

// Europe/Bucharest 2026: EET (+02) → EEST (+03) on Mar 29 at 01:00Z,
// EEST → EET on Oct 25 at 01:00Z.
const BUCHAREST = "Europe/Bucharest";

describe("parseIsoWallClockInTimezone", () => {
  // Timezone is the source of truth: the "+05:30" offset must be ignored,
  // 10:00 is read as Bucharest wall clock (EET, +02) → 08:00Z.
  it("ignores the ISO offset and uses the timezone", () => {
    expect(
      parseIsoWallClockInTimezone("2026-03-15T10:00:00+05:30", BUCHAREST),
    ).toEqual(new Date("2026-03-15T08:00:00Z"));
  });

  // Same digits with "Z", no offset, or a different offset must all resolve
  // to the same instant — the suffix carries no meaning.
  it.each([
    "2026-03-15T10:00:00",
    "2026-03-15T10:00:00Z",
    "2026-03-15T10:00:00-07:00",
  ])("treats %s identically regardless of suffix", (iso) => {
    expect(parseIsoWallClockInTimezone(iso, BUCHAREST)).toEqual(
      new Date("2026-03-15T08:00:00Z"),
    );
  });

  // Milliseconds (exactly 3 digits) are preserved. ".050" guards against
  // leading zeros being lost when parsing the fraction.
  it.each([
    ["2026-03-15T10:00:00.999Z", "2026-03-15T08:00:00.999Z"],
    ["2026-03-15T10:00:00.050+05:30", "2026-03-15T08:00:00.050Z"],
    ["2026-03-15T10:00:00.000", "2026-03-15T08:00:00.000Z"],
  ])("keeps milliseconds of %s", (iso, expected) => {
    expect(parseIsoWallClockInTimezone(iso, BUCHAREST)).toEqual(
      new Date(expected),
    );
  });

  // Milliseconds must survive the DST re-check path too (second offset
  // correction recomputes from estimatedUtc).
  it("keeps milliseconds through the DST re-check path", () => {
    expect(
      parseIsoWallClockInTimezone("2026-03-29T02:59:59.500", BUCHAREST),
    ).toEqual(new Date("2026-03-29T00:59:59.500Z"));
  });

  // Offset sign + non-whole-hour offsets: covers parseOffsetString's sign
  // handling and the optional ":mm" group (GMT-4, GMT+5:30, GMT+5:45).
  it.each([
    ["UTC", "2026-07-04T09:00:00", "2026-07-04T09:00:00Z"],
    ["America/New_York", "2026-07-04T09:00:00", "2026-07-04T13:00:00Z"],
    ["America/New_York", "2026-01-04T09:00:00", "2026-01-04T14:00:00Z"],
    ["Asia/Kolkata", "2026-07-04T10:00:00", "2026-07-04T04:30:00Z"],
    ["Asia/Kathmandu", "2026-07-04T10:00:00", "2026-07-04T04:15:00Z"],
  ])("%s %s → %s", (tz, iso, expected) => {
    expect(parseIsoWallClockInTimezone(iso, tz)).toEqual(new Date(expected));
  });

  // Large positive offset (NZDT +13) pushes the UTC instant to the previous
  // day and previous year — verifies no date-part truncation on rollover.
  it("crosses day and year boundaries", () => {
    expect(
      parseIsoWallClockInTimezone("2026-01-01T05:00:00", "Pacific/Auckland"),
    ).toEqual(new Date("2025-12-31T16:00:00Z"));
  });

  describe("DST", () => {
    // 05:00 local on spring-forward day is safely in EEST (+03).
    it("uses the post-transition offset after spring-forward", () => {
      expect(
        parseIsoWallClockInTimezone("2026-03-29T05:00:00", BUCHAREST),
      ).toEqual(new Date("2026-03-29T02:00:00Z"));
    });

    // 02:59:59 local is still EET (+02) → 00:59:59Z. The first estimate
    // (02:59:59Z) is past the transition so it picks +03 — wrong. This case
    // only passes because of the second offset re-check.
    it("corrects the offset just before spring-forward (re-check path)", () => {
      expect(
        parseIsoWallClockInTimezone("2026-03-29T02:59:59", BUCHAREST),
      ).toEqual(new Date("2026-03-29T00:59:59Z"));
    });

    // 03:30 local doesn't exist (clocks jump 03:00 → 04:00). Must not throw;
    // it resolves with the pre-gap offset (+02) → 01:30Z, i.e. 04:30 EEST
    // (shifted forward by the gap length).
    it("shifts a nonexistent time in the spring-forward gap forward", () => {
      const result = parseIsoWallClockInTimezone(
        "2026-03-29T03:30:00",
        BUCHAREST,
      );
      expect(result).toEqual(new Date("2026-03-29T01:30:00Z"));
      expect(utcToIso(result, BUCHAREST)).toBe("2026-03-29T04:30:00+03:00");
    });

    // 03:30 local happens twice (00:30Z in EEST and 01:30Z in EET).
    // Pins which one is chosen: the later, standard-time occurrence.
    it("resolves an ambiguous fall-back time to the later occurrence", () => {
      expect(
        parseIsoWallClockInTimezone("2026-10-25T03:30:00", BUCHAREST),
      ).toEqual(new Date("2026-10-25T01:30:00Z"));
    });

    // 04:00 local on fall-back day is unambiguous EET (+02).
    it("uses the post-transition offset after fall-back", () => {
      expect(
        parseIsoWallClockInTimezone("2026-10-25T04:00:00", BUCHAREST),
      ).toEqual(new Date("2026-10-25T02:00:00Z"));
    });
  });

  describe("invalid input", () => {
    // Regex requires full YYYY-MM-DDTHH:mm:ss at the start of the string,
    // optionally followed by exactly 3 ms digits (toISOString format).
    // Extra seconds digits or a bare "." must not be silently ignored.
    it.each([
      "2026-03-15",
      "2026-03-15T10:00",
      "2026-03-15 10:00:00",
      " 2026-03-15T10:00:00",
      "15/03/2026T10:00:00",
      "",
      "2026-03-15T10:00:00.5Z",
      "2026-03-15T10:00:00.50+02:00",
      "2026-03-15T10:00:00.1234Z",
      "2026-03-15T10:00:00.Z",
      "2026-03-15T10:00:001",
    ])("throws a DomainError for %p", (iso) => {
      expect(() => parseIsoWallClockInTimezone(iso, BUCHAREST)).toThrow(
        DomainError,
      );
      expect(() => parseIsoWallClockInTimezone(iso, BUCHAREST)).toThrow(
        `Invalid ISO 8601 date: ${iso}`,
      );
    });

    // Unknown IANA zone: Intl throws a RangeError; it must not silently
    // fall back to UTC.
    it("throws for an unknown timezone", () => {
      expect(() =>
        parseIsoWallClockInTimezone("2026-03-15T10:00:00", "Mars/Olympus"),
      ).toThrow(RangeError);
    });
  });
});

describe("utcToIso", () => {
  it("formats in the timezone with its offset", () => {
    expect(utcToIso(new Date("2026-03-15T08:00:00Z"), BUCHAREST)).toBe(
      "2026-03-15T10:00:00+02:00",
    );
  });

  // Intl renders UTC's offset as bare "GMT" (no sign/digits) — must become
  // "+00:00", not throw or produce "Z"/"-00:00".
  it("formats UTC as +00:00", () => {
    expect(utcToIso(new Date("2026-03-15T08:00:00Z"), "UTC")).toBe(
      "2026-03-15T08:00:00+00:00",
    );
  });

  // Same instant, DST vs non-DST, plus negative and fractional offsets:
  // covers formatOffset sign and minute padding.
  it.each([
    ["America/New_York", "2026-07-04T13:00:00Z", "2026-07-04T09:00:00-04:00"],
    ["America/New_York", "2026-01-04T14:00:00Z", "2026-01-04T09:00:00-05:00"],
    ["Asia/Kolkata", "2026-07-04T04:30:00Z", "2026-07-04T10:00:00+05:30"],
    ["Asia/Kathmandu", "2026-07-04T04:15:00Z", "2026-07-04T10:00:00+05:45"],
    ["Pacific/Auckland", "2025-12-31T16:00:00Z", "2026-01-01T05:00:00+13:00"],
  ])("%s %s → %s", (tz, utc, expected) => {
    expect(utcToIso(new Date(utc), tz)).toBe(expected);
  });

  // Regression guard: with hour12:false some ICU/Intl versions render
  // midnight as "24" (h24 cycle) instead of "00".
  it("renders midnight as 00, not 24", () => {
    expect(utcToIso(new Date("2026-03-15T22:00:00Z"), BUCHAREST)).toBe(
      "2026-03-16T00:00:00+02:00",
    );
    expect(utcToIso(new Date("2026-03-16T00:00:00Z"), "UTC")).toBe(
      "2026-03-16T00:00:00+00:00",
    );
  });

  // Milliseconds appear only when non-zero (keeps whole-second output
  // unchanged); padded to 3 digits so ".050" doesn't become ".50".
  it.each([
    ["2026-03-15T08:00:00.999Z", "UTC", "2026-03-15T08:00:00.999+00:00"],
    ["2026-03-15T08:00:00.050Z", BUCHAREST, "2026-03-15T10:00:00.050+02:00"],
    [
      "2026-03-15T08:00:00.001Z",
      "Asia/Kathmandu",
      "2026-03-15T13:45:00.001+05:45",
    ],
    ["2026-03-15T08:00:00.000Z", "UTC", "2026-03-15T08:00:00+00:00"],
  ])("formats milliseconds of %s in %s", (utc, tz, expected) => {
    expect(utcToIso(new Date(utc), tz)).toBe(expected);
  });

  // The two instants that share wall clock 03:30 on fall-back day must stay
  // distinguishable via their offset.
  it("disambiguates fall-back instants by offset", () => {
    expect(utcToIso(new Date("2026-10-25T00:30:00Z"), BUCHAREST)).toBe(
      "2026-10-25T03:30:00+03:00",
    );
    expect(utcToIso(new Date("2026-10-25T01:30:00Z"), BUCHAREST)).toBe(
      "2026-10-25T03:30:00+02:00",
    );
  });

  // The two functions are used as inverse pairs (inbound sync parses,
  // outbound sync formats). For any unambiguous instant, round-trip is
  // lossless.
  it.each([
    [BUCHAREST, "2026-03-29T00:59:59Z"],
    [BUCHAREST, "2026-03-29T01:00:00Z"],
    [BUCHAREST, "2026-10-25T02:00:00Z"],
    ["America/New_York", "2026-11-01T07:00:00Z"],
    ["Asia/Kathmandu", "2026-07-04T04:15:00Z"],
    ["Pacific/Auckland", "2025-12-31T16:00:00Z"],
    [BUCHAREST, "2026-03-29T00:59:59.999Z"],
    ["Asia/Kolkata", "2026-07-04T04:30:00.050Z"],
  ])("round-trips %s %s", (tz, utc) => {
    const date = new Date(utc);
    expect(parseIsoWallClockInTimezone(utcToIso(date, tz), tz)).toEqual(date);
  });
});

describe("validateAndNormalizeRrule", () => {
  const start = new Date("2026-03-15T08:00:00Z");

  describe("COUNT", () => {
    // COUNT is banned (series must be bounded by date). Check is
    // case-insensitive.
    it.each(["FREQ=DAILY;COUNT=5", "FREQ=DAILY;count=5"])(
      "rejects %s",
      (rrule) => {
        expect(() =>
          validateAndNormalizeRrule(rrule, BUCHAREST, start),
        ).toThrow("rrule must use UNTIL, not COUNT");
      },
    );

    // COUNT wins even when UNTIL is also present (RFC 5545 forbids both).
    it("rejects COUNT even with UNTIL", () => {
      expect(() =>
        validateAndNormalizeRrule(
          "FREQ=DAILY;COUNT=5;UNTIL=20260401T000000Z",
          BUCHAREST,
          start,
        ),
      ).toThrow(DomainError);
    });
  });

  describe("default UNTIL", () => {
    // Missing UNTIL → start + 1 year in RFC 5545 UTC form, then TZID.
    it("appends UNTIL = start + 1 year and TZID", () => {
      expect(
        validateAndNormalizeRrule("FREQ=WEEKLY;BYDAY=MO", BUCHAREST, start),
      ).toBe(
        "FREQ=WEEKLY;BYDAY=MO;UNTIL=20270315T080000Z;TZID=Europe/Bucharest",
      );
    });

    // Default UNTIL is exactly at the 12-month limit — boundary must be
    // inclusive or every rrule without UNTIL would fail.
    it("default UNTIL sits exactly on the default max and passes", () => {
      expect(() =>
        validateAndNormalizeRrule("FREQ=DAILY", BUCHAREST, start),
      ).not.toThrow();
    });

    // Feb 29 + 1 year rolls to Mar 1 via setUTCFullYear; max uses
    // setUTCMonth(+12) and also lands on Mar 1, so they still agree.
    it("handles a leap-day start", () => {
      expect(
        validateAndNormalizeRrule(
          "FREQ=YEARLY",
          "UTC",
          new Date("2028-02-29T10:00:00Z"),
        ),
      ).toBe("FREQ=YEARLY;UNTIL=20290301T100000Z;TZID=UTC");
    });

    // UNTIL is formatted with zero-padding and the start's seconds kept.
    it("zero-pads UNTIL parts", () => {
      expect(
        validateAndNormalizeRrule(
          "FREQ=DAILY",
          "UTC",
          new Date("2026-01-02T03:04:05.678Z"),
        ),
      ).toBe("FREQ=DAILY;UNTIL=20270102T030405Z;TZID=UTC");
    });
  });

  describe("explicit UNTIL", () => {
    // Valid UNTIL is preserved verbatim; only TZID is appended.
    it("keeps a valid UNTIL as-is", () => {
      expect(
        validateAndNormalizeRrule(
          "FREQ=WEEKLY;UNTIL=20260601T000000Z;BYDAY=MO",
          BUCHAREST,
          start,
        ),
      ).toBe(
        "FREQ=WEEKLY;UNTIL=20260601T000000Z;BYDAY=MO;TZID=Europe/Bucharest",
      );
    });

    // Lowercase key and missing trailing Z are both tolerated.
    it.each([
      "FREQ=DAILY;until=20260601T000000Z",
      "FREQ=DAILY;UNTIL=20260601T000000",
    ])("accepts %s", (rrule) => {
      expect(() =>
        validateAndNormalizeRrule(rrule, BUCHAREST, start),
      ).not.toThrow();
    });

    // Floating UNTIL (no Z) is interpreted as UTC for the limit check:
    // 20270315T080000 == start + 12 months exactly → allowed; +1s → rejected.
    it("treats UNTIL without Z as UTC", () => {
      expect(() =>
        validateAndNormalizeRrule(
          "FREQ=DAILY;UNTIL=20270315T080000",
          BUCHAREST,
          start,
        ),
      ).not.toThrow();
      expect(() =>
        validateAndNormalizeRrule(
          "FREQ=DAILY;UNTIL=20270315T080001",
          BUCHAREST,
          start,
        ),
      ).toThrow(DomainError);
    });

    // Inclusive boundary: exactly at max passes, one second past fails.
    it("enforces the 12-month limit inclusively", () => {
      expect(() =>
        validateAndNormalizeRrule(
          "FREQ=DAILY;UNTIL=20270315T080000Z",
          BUCHAREST,
          start,
        ),
      ).not.toThrow();
      expect(() =>
        validateAndNormalizeRrule(
          "FREQ=DAILY;UNTIL=20270315T080001Z",
          BUCHAREST,
          start,
        ),
      ).toThrow("rrule UNTIL must be within 12 months of start");
    });

    // Custom maxMonths is respected and reflected in the error message.
    it("respects a custom maxMonths", () => {
      const rrule = "FREQ=DAILY;UNTIL=20260916T000000Z";
      expect(() =>
        validateAndNormalizeRrule(rrule, BUCHAREST, start, 6),
      ).toThrow("rrule UNTIL must be within 6 months of start");
      expect(() =>
        validateAndNormalizeRrule(rrule, BUCHAREST, start, 7),
      ).not.toThrow();
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
        validateAndNormalizeRrule(
          `FREQ=DAILY;UNTIL=${until}`,
          BUCHAREST,
          start,
        ),
      ).toThrow(`rrule UNTIL is not a valid date: ${until}`);
    });
  });

  describe("TZID", () => {
    // Existing TZID (any case) is never duplicated nor overwritten, even if it
    // differs from the event timezone.
    it.each([
      "FREQ=DAILY;UNTIL=20260601T000000Z;TZID=UTC",
      "FREQ=DAILY;UNTIL=20260601T000000Z;tzid=UTC",
    ])("leaves existing TZID untouched in %s", (rrule) => {
      expect(validateAndNormalizeRrule(rrule, BUCHAREST, start)).toBe(rrule);
    });

    // Idempotent: normalizing an already-normalized rrule is a no-op. The
    // split flow re-validates the stored (normalized) rrule.
    it("is idempotent", () => {
      const once = validateAndNormalizeRrule("FREQ=DAILY", BUCHAREST, start);
      expect(validateAndNormalizeRrule(once, BUCHAREST, start)).toBe(once);
    });
  });
});

describe("replaceRruleUntil", () => {
  const newUntil = new Date("2026-05-01T09:08:07.654Z");

  // Only the UNTIL value changes; other parts and their order are kept.
  it.each([
    [
      "FREQ=WEEKLY;UNTIL=20270315T080000Z;BYDAY=MO;TZID=UTC",
      "FREQ=WEEKLY;UNTIL=20260501T090807Z;BYDAY=MO;TZID=UTC",
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
    expect(replaceRruleUntil("FREQ=DAILY;TZID=UTC", newUntil)).toBe(
      "FREQ=DAILY;TZID=UTC",
    );
  });

  // Output must be parseable by validateAndNormalizeRrule (formats agree).
  it("produces an UNTIL that validateAndNormalizeRrule accepts", () => {
    const start = new Date("2026-03-15T08:00:00Z");
    const rrule = replaceRruleUntil(
      "FREQ=DAILY;UNTIL=20270315T080000Z",
      newUntil,
    );
    expect(validateAndNormalizeRrule(rrule, "UTC", start)).toBe(
      `${rrule};TZID=UTC`,
    );
  });
});
