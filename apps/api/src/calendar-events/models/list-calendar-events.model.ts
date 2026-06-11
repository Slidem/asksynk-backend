export interface ListCalendarEventsInput {
  windowStart: Date;
  windowEnd: Date;
  tagIds?: string[];
  // optional: restrict to a single calendar (must belong to the target user)
  calendarId?: string;
}
