export type AnswerModeSpec =
  | { tagId: string; type: "immediately"; responseTimeMillis: number }
  | { tagId: string; type: "timeblock" };

export type TimeblockOccurrence = { startAt: Date; eventId: string };

export type DueDateDecision = {
  dueDate: Date | null;
  dueSourceEventId: string | null;
};

/** Earliest wins. immediately → base + responseTimeMillis; timeblock → next occurrence
 *  of an event carrying that tag. Ties keep the first candidate. */
export function decideDueDate(input: {
  answerModes: readonly AnswerModeSpec[];
  occurrences: ReadonlyMap<string, TimeblockOccurrence>;
  base: Date;
}): DueDateDecision {
  let dueDate: Date | null = null;
  let dueSourceEventId: string | null = null;
  for (const mode of input.answerModes) {
    if (mode.type === "immediately") {
      const candidate = new Date(
        input.base.getTime() + mode.responseTimeMillis,
      );
      if (!dueDate || candidate < dueDate) {
        dueDate = candidate;
        dueSourceEventId = null;
      }
    } else {
      const occ = input.occurrences.get(mode.tagId);
      if (occ && (!dueDate || occ.startAt < dueDate)) {
        dueDate = occ.startAt;
        dueSourceEventId = occ.eventId;
      }
    }
  }
  return { dueDate, dueSourceEventId };
}
