export interface SplitCalendarEventSeriesInput {
  eventId: string;
  title?: string;
  description?: string;
  location?: string;
  link?: string;
  start?: Date;
  durationSeconds?: number;
  timezone?: string;
  rrule?: string;
  color?: string;
  tagIds?: string[];
}
