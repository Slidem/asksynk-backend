export type EventInstanceId = string;

export interface CalendarEventInstance {
  eventId: string;
  instanceId: string;
  calendarId: string;
  // calendar source: "asksynk" (native) or a provider id like "google"
  source: string;
  // imported events are read-only except for tags
  readOnly: boolean;
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
