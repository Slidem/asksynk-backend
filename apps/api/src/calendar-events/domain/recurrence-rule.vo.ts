import {
  replaceRruleUntil,
  validateAndNormalizeRrule,
} from "@/api/calendar-events/domain/recurrence";

/** A normalized rrule: no COUNT, UNTIL within 12 months of start, TZID embedded. */
export class RecurrenceRule {
  private constructor(readonly value: string) {}

  static create(rrule: string, timezone: string, start: Date): RecurrenceRule {
    return new RecurrenceRule(validateAndNormalizeRrule(rrule, timezone, start));
  }

  /** Rehydrate an already-normalized rrule (e.g. loaded from the DB). */
  static restore(value: string): RecurrenceRule {
    return new RecurrenceRule(value);
  }

  withUntil(until: Date): RecurrenceRule {
    return new RecurrenceRule(replaceRruleUntil(this.value, until));
  }
}
