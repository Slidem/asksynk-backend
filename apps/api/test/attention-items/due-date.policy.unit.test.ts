import {
  AnswerModeSpec,
  decideDueDate,
  TimeblockOccurrence,
} from "@/api/attention-items/domain/due-date.policy";

const base = new Date("2026-01-01T10:00:00Z");
const HOUR = 60 * 60 * 1000;

const immediate = (tagId: string, hours: number): AnswerModeSpec => ({
  tagId,
  type: "immediately",
  responseTimeMillis: hours * HOUR,
});
const timeblock = (tagId: string): AnswerModeSpec => ({
  tagId,
  type: "timeblock",
});
const occurrences = (
  entries: [string, TimeblockOccurrence][],
): Map<string, TimeblockOccurrence> => new Map(entries);

describe("decideDueDate", () => {
  it("immediate wins when earlier than the timeblock occurrence", () => {
    const result = decideDueDate({
      answerModes: [timeblock("tb"), immediate("im", 1)],
      occurrences: occurrences([
        ["tb", { startAt: new Date(base.getTime() + 2 * HOUR), eventId: "e1" }],
      ]),
      base,
    });

    expect(result).toEqual({
      dueDate: new Date(base.getTime() + HOUR),
      dueSourceEventId: null,
    });
  });

  it("timeblock wins when its occurrence is earlier", () => {
    const startAt = new Date(base.getTime() + HOUR);
    const result = decideDueDate({
      answerModes: [immediate("im", 3), timeblock("tb")],
      occurrences: occurrences([["tb", { startAt, eventId: "e1" }]]),
      base,
    });

    expect(result).toEqual({ dueDate: startAt, dueSourceEventId: "e1" });
  });

  it("mixed tie keeps the first candidate", () => {
    const startAt = new Date(base.getTime() + HOUR);
    const occ = occurrences([["tb", { startAt, eventId: "e1" }]]);

    expect(
      decideDueDate({
        answerModes: [immediate("im", 1), timeblock("tb")],
        occurrences: occ,
        base,
      }),
    ).toEqual({ dueDate: startAt, dueSourceEventId: null });

    expect(
      decideDueDate({
        answerModes: [timeblock("tb"), immediate("im", 1)],
        occurrences: occ,
        base,
      }),
    ).toEqual({ dueDate: startAt, dueSourceEventId: "e1" });
  });

  it("no tags → no due date", () => {
    expect(
      decideDueDate({ answerModes: [], occurrences: new Map(), base }),
    ).toEqual({ dueDate: null, dueSourceEventId: null });
  });

  it("timeblock without an upcoming occurrence → no due date", () => {
    expect(
      decideDueDate({
        answerModes: [timeblock("tb")],
        occurrences: new Map(),
        base,
      }),
    ).toEqual({ dueDate: null, dueSourceEventId: null });
  });
});
