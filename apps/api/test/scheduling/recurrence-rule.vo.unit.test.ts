import { DomainError } from "@/api/kernel/errors/domain-errors";
import { RecurrenceRule } from "@/api/scheduling/domain/recurrence-rule.vo";

const start = new Date("2026-03-15T08:00:00Z");

describe("RecurrenceRule", () => {
  it("normalizes on create (default UNTIL)", () => {
    expect(RecurrenceRule.create("FREQ=WEEKLY;BYDAY=MO", start).value).toBe(
      "FREQ=WEEKLY;BYDAY=MO;UNTIL=20270315T080000Z",
    );
  });

  it("keeps a valid UNTIL and drops TZID", () => {
    expect(
      RecurrenceRule.create(
        "FREQ=DAILY;UNTIL=20260601T000000Z;TZID=Europe/Bucharest",
        start,
      ).value,
    ).toBe("FREQ=DAILY;UNTIL=20260601T000000Z");
  });

  it("rejects COUNT", () => {
    expect(() => RecurrenceRule.create("FREQ=DAILY;COUNT=5", start)).toThrow(
      DomainError,
    );
  });

  it("rejects UNTIL beyond 12 months", () => {
    expect(() =>
      RecurrenceRule.create("FREQ=DAILY;UNTIL=20270316T000000Z", start),
    ).toThrow(DomainError);
  });

  it("withUntil replaces UNTIL and returns a new rule", () => {
    const rule = RecurrenceRule.create("FREQ=DAILY", start);
    const truncated = rule.withUntil(new Date("2026-04-01T00:00:01Z"));

    expect(truncated.value).toBe("FREQ=DAILY;UNTIL=20260401T000001Z");
    expect(rule.value).toBe("FREQ=DAILY;UNTIL=20270315T080000Z");
  });

  it("restore keeps the stored value as-is", () => {
    const stored = "FREQ=DAILY;UNTIL=20260401T000000Z";
    expect(RecurrenceRule.restore(stored).value).toBe(stored);
  });
});
