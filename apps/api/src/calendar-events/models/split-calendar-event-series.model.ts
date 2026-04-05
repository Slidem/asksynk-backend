export interface SplitCalendarEventSeriesInput {
  eventId: string;
  splitStart: Date;
  title?: string;
  description?: string;
  location?: string;
  link?: string;
  durationSeconds?: number;
  timezone?: string;
  rrule?: string;
  color?: string;
  tagIds?: string[];
}
