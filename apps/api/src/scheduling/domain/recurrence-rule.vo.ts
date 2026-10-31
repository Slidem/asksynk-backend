import {
  replaceRruleUntil,
  validateAndNormalizeRrule,
} from "@/api/scheduling/domain/recurrence";

/** A normalized rrule: no COUNT, no TZID, UNTIL within 12 months of start. */
export class RecurrenceRule {
  private constructor(readonly value: string) {}

  static create(rrule: string, start: Date): RecurrenceRule {
    return new RecurrenceRule(validateAndNormalizeRrule(rrule, start));
  }

  /** Rehydrate an already-normalized rrule (e.g. loaded from the DB). */
  static restore(value: string): RecurrenceRule {
    return new RecurrenceRule(value);
  }

  withUntil(until: Date): RecurrenceRule {
    return new RecurrenceRule(replaceRruleUntil(this.value, until));
  }
}
