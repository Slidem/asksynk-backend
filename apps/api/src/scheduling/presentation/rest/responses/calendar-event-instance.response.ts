export class CalendarEventInstanceResponse {
  eventId!: string;
  instanceId!: string;
  calendarId!: string;

  /** Calendar source: "asksynk" (native) or a provider id like "google". */
  source!: string;

  /** Imported events are read-only except for tags. */
  readOnly!: boolean;

  title!: string;
  description!: string | null;
  location!: string | null;
  link!: string | null;
  instanceStart!: Date;
  durationSeconds!: number;
  allDay!: boolean;
  rrule!: string | null;
  timezone!: string;
  color!: string | null;
  tagIds!: string[];
}
