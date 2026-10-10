import { RecurrenceRule } from "@/api/calendar-events/domain/recurrence-rule.vo";
import { DomainError } from "@/api/kernel/errors/domain-errors";

const start = new Date("2026-03-15T08:00:00Z");
const tz = "Europe/Bucharest";

describe("RecurrenceRule", () => {
  it("normalizes on create (default UNTIL + TZID)", () => {
    expect(RecurrenceRule.create("FREQ=WEEKLY;BYDAY=MO", tz, start).value).toBe(
      "FREQ=WEEKLY;BYDAY=MO;UNTIL=20270315T080000Z;TZID=Europe/Bucharest",
    );
  });

  it("keeps a valid UNTIL and an existing TZID", () => {
    const rrule = "FREQ=DAILY;UNTIL=20260601T000000Z;TZID=Europe/Bucharest";
    expect(RecurrenceRule.create(rrule, tz, start).value).toBe(rrule);
  });

  it("rejects COUNT", () => {
    expect(() =>
      RecurrenceRule.create("FREQ=DAILY;COUNT=5", tz, start),
    ).toThrow(DomainError);
  });

  it("rejects UNTIL beyond 12 months", () => {
    expect(() =>
      RecurrenceRule.create("FREQ=DAILY;UNTIL=20270316T000000Z", tz, start),
    ).toThrow(DomainError);
  });

  it("withUntil replaces UNTIL and returns a new rule", () => {
    const rule = RecurrenceRule.create("FREQ=DAILY", tz, start);
    const truncated = rule.withUntil(new Date("2026-04-01T00:00:01Z"));

    expect(truncated.value).toBe(
      "FREQ=DAILY;UNTIL=20260401T000001Z;TZID=Europe/Bucharest",
    );
    expect(rule.value).toBe(
      "FREQ=DAILY;UNTIL=20270315T080000Z;TZID=Europe/Bucharest",
    );
  });

  it("restore keeps the stored value as-is", () => {
    const stored = "FREQ=DAILY;UNTIL=20260401T000000Z;TZID=Europe/Bucharest";
    expect(RecurrenceRule.restore(stored).value).toBe(stored);
  });
});
