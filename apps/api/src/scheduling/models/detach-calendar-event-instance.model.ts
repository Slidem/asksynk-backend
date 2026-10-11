export interface DetachCalendarEventInstanceInput {
  eventId: string;
  occurrenceStart: Date;
  title?: string;
  description?: string;
  location?: string;
  link?: string;
  start?: Date;
  durationSeconds?: number;
  timezone?: string;
  color?: string;
  tagIds?: string[];
}
