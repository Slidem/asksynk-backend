export interface CalendarEventProps {
  id: string;
  calendarId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  link?: string | null;
  start: Date;
  durationSeconds: number;
  allDay?: boolean;
  timezone: string;
  rrule?: string | null;
  color?: string | null;
  originalEventId?: string | null;
  originalStart?: Date | null;
  recurrenceEnd?: Date | null;
  tagIds?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export class CalendarEvent {
  readonly id: string;
  readonly calendarId: string;
  title: string;
  description: string | null;
  location: string | null;
  link: string | null;
  start: Date;
  durationSeconds: number;
  allDay: boolean;
  timezone: string;
  rrule: string | null;
  color: string | null;
  originalEventId: string | null;
  originalStart: Date | null;
  recurrenceEnd: Date | null;
  tagIds: string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: Required<CalendarEventProps>) {
    this.id = props.id;
    this.calendarId = props.calendarId;
    this.title = props.title;
    this.description = props.description;
    this.location = props.location;
    this.link = props.link;
    this.start = props.start;
    this.durationSeconds = props.durationSeconds;
    this.allDay = props.allDay;
    this.timezone = props.timezone;
    this.rrule = props.rrule;
    this.color = props.color;
    this.originalEventId = props.originalEventId;
    this.originalStart = props.originalStart;
    this.recurrenceEnd = props.recurrenceEnd;
    this.tagIds = props.tagIds;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: CalendarEventProps): CalendarEvent {
    return new CalendarEvent({
      description: null,
      location: null,
      link: null,
      allDay: false,
      rrule: null,
      color: null,
      originalEventId: null,
      originalStart: null,
      recurrenceEnd: null,
      tagIds: [],
      ...props,
    });
  }

  get isRecurring(): boolean {
    return !!this.rrule;
  }

  belongsTo(calendarId: string): boolean {
    return this.calendarId === calendarId;
  }
}
