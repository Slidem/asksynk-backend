export interface UpdateCalendarEventInput {
  eventId: string;
  title?: string;
  description?: string;
  location?: string;
  link?: string;
  start?: Date;
  durationSeconds?: number;
  allDay?: boolean;
  timezone?: string;
  rrule?: string;
  color?: string;
  tagIds?: string[];
}
