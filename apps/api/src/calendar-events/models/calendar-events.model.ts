export interface CreateCalendarEventInput {
  id: string;
  title: string;
  description?: string;
  location?: string;
  link?: string;
  start: Date;
  durationSeconds: number;
  allDay?: boolean;
  timezone: string;
  rrule?: string;
  color?: string;
  tagIds?: string[];
}

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

export interface ListCalendarEventsInput {
  windowStart: Date;
  windowEnd: Date;
}

export interface AddCalendarEventExceptionInput {
  eventId: string;
  occurrenceStart: Date;
}

export interface DetachCalendarCalendarEventInstanceInput {
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

export interface CalendarEventInstance {
  eventId: string;
  title: string;
  description: string | null;
  location: string | null;
  link: string | null;
  instanceStart: Date;
  durationSeconds: number;
  allDay: boolean;
  timezone: string;
  color: string | null;
  tagIds: string[];
}
