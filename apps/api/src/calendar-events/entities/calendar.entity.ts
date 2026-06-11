import { CalendarProviderState } from "@/migrations/schema/calendars";

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
