export type NextOccurrence = { startAt: Date; eventId: string };

export abstract class CalendarOccurrencePort {
  // Per tag: the earliest occurrence (recurring or not, exceptions skipped)
  // of a tagged event that hasn't ended by `after`, within a 365-day horizon.
  abstract findNextOccurrenceByTag(
    tagIds: string[],
    after: Date,
  ): Promise<Map<string, NextOccurrence>>;
}
