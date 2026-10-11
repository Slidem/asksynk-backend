// Same shape as the calendars.provider_state jsonb column; declared here so the
// domain doesn't import the Drizzle schema.
export interface CalendarProviderState {
  // provider calendar's default IANA timezone — fallback for imported events
  // whose own start/end carry no timezone (e.g. Google single timed events)
  timezone?: string;
  // the account's primary calendar — outbound mirror target for native events
  isPrimary?: boolean;
  // webhook watch channel state (populated only once webhooks land)
  watchChannelId?: string;
  watchResourceId?: string;
  watchExpiresAt?: number;
}

export interface CalendarProps {
  id: string;
  userId: string;
  source: string;
  name: string | null;
  color: string | null;
  externalId: string | null;
  integrationId: string | null;
  syncEnabled: boolean;
  syncToken: string | null;
  providerState: CalendarProviderState;
  createdAt: Date;
}

export class Calendar {
  readonly id: string;
  readonly userId: string;
  readonly source: string;
  name: string | null;
  color: string | null;
  externalId: string | null;
  readonly integrationId: string | null;
  syncEnabled: boolean;
  syncToken: string | null;
  providerState: CalendarProviderState;
  readonly createdAt: Date;

  private constructor(props: CalendarProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.source = props.source;
    this.name = props.name;
    this.color = props.color;
    this.externalId = props.externalId;
    this.integrationId = props.integrationId;
    this.syncEnabled = props.syncEnabled;
    this.syncToken = props.syncToken;
    this.providerState = props.providerState;
    this.createdAt = props.createdAt;
  }

  static create(props: CalendarProps): Calendar {
    return new Calendar(props);
  }

  belongsTo(userId: string): boolean {
    return this.userId === userId;
  }

  get isNative(): boolean {
    return this.source === "asksynk";
  }
}
