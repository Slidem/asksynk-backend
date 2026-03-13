export interface CreateEventInput {
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

export interface UpdateEventInput {
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

export interface ListEventsInput {
  windowStart: Date;
  windowEnd: Date;
}

export interface AddExceptionInput {
  eventId: string;
  occurrenceStart: Date;
}

export interface DetachInstanceInput {
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

export interface SplitSeriesInput {
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

export interface EventInstance {
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
