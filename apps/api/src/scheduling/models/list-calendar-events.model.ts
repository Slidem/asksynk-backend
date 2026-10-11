export interface ListCalendarEventsInput {
  // whose calendar: self when omitted; a connected user's otherwise
  userId?: string;
  windowStart: Date;
  windowEnd: Date;
  tagIds?: string[];

  // optional: restrict to a single calendar (must belong to the target user)
  calendarId?: string;
}
