import { RecurrenceType } from "@/api/events/events.model";

export interface OccurrenceParams {
  type: RecurrenceType;
  start: Date;
  end: Date;
  until: Date;
}

export interface Occurrence {
  start: Date;
  end: Date;
}

export function computeOccurrences(params: OccurrenceParams): Occurrence[] {
  const { type, start, end, until } = params;
  const durationMs = end.getTime() - start.getTime();
  const occurrences: Occurrence[] = [];

  let cursor = new Date(start);

  while (cursor.getTime() <= until.getTime()) {
    if (type === "weekdays") {
      const day = cursor.getDay();
      if (day >= 1 && day <= 5) {
        occurrences.push({
          start: new Date(cursor),
          end: new Date(cursor.getTime() + durationMs),
        });
      }
    } else {
      occurrences.push({
        start: new Date(cursor),
        end: new Date(cursor.getTime() + durationMs),
      });
    }

    cursor = advanceCursor(cursor, type);
  }

  return occurrences;
}

function advanceCursor(current: Date, type: RecurrenceType): Date {
  const next = new Date(current);

  switch (type) {
    case "daily":
    case "weekdays":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "bi-weekly":
      next.setDate(next.getDate() + 14);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
  }

  return next;
}

export function defaultUntilDate(from: Date): Date {
  const until = new Date(from);
  until.setFullYear(until.getFullYear() + 1);
  return until;
}
