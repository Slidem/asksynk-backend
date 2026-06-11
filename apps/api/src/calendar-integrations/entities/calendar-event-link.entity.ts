export type CalendarLinkOrigin = "imported" | "mirrored";

export interface CalendarEventLinkProps {
  id: string;
  asksynkEventId: string;
  integrationId: string;
  externalCalendarId: string;
  externalEventId: string;
  etag: string | null;
  origin: CalendarLinkOrigin;
  degraded: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class CalendarEventLink {
  readonly id: string;
  readonly asksynkEventId: string;
  readonly integrationId: string;
  readonly externalCalendarId: string;
  readonly externalEventId: string;
  etag: string | null;
  readonly origin: CalendarLinkOrigin;
  degraded: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: CalendarEventLinkProps) {
    this.id = props.id;
    this.asksynkEventId = props.asksynkEventId;
    this.integrationId = props.integrationId;
    this.externalCalendarId = props.externalCalendarId;
    this.externalEventId = props.externalEventId;
    this.etag = props.etag;
    this.origin = props.origin;
    this.degraded = props.degraded;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: CalendarEventLinkProps): CalendarEventLink {
    return new CalendarEventLink(props);
  }

  get isMirrored(): boolean {
    return this.origin === "mirrored";
  }
}
