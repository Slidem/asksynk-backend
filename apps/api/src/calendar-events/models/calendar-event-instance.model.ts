export type EventInstanceId = string;

export interface CalendarEventInstance {
  eventId: string;
  instanceId: string;
  title: string;
  description: string | null;
  location: string | null;
  link: string | null;
  instanceStart: Date;
  durationSeconds: number;
  allDay: boolean;
  rrule: string | null;
  timezone: string;
  color: string | null;
  tagIds: string[];
}
