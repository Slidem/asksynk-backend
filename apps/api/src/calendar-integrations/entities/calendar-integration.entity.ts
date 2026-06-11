import {
  CalendarIntegrationCredentials,
  CalendarIntegrationProviderData,
} from "@/migrations/schema/calendarIntegrations";

export type CalendarIntegrationStatus = "active" | "error" | "revoked";
export type CalendarSyncDirection = "bidirectional" | "readonly";

// refresh the access token this many ms before it actually expires
const REFRESH_SKEW_MS = 60_000;

export interface CalendarIntegrationProps {
  id: string;
  userId: string;
  provider: string;
  externalAccountId: string;
  status: CalendarIntegrationStatus;
  syncDirection: CalendarSyncDirection;
  credentials: CalendarIntegrationCredentials;
  providerData: CalendarIntegrationProviderData;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class CalendarIntegration {
  readonly id: string;
  readonly userId: string;
  readonly provider: string;
  readonly externalAccountId: string;
  status: CalendarIntegrationStatus;
  syncDirection: CalendarSyncDirection;
  credentials: CalendarIntegrationCredentials;
  providerData: CalendarIntegrationProviderData;
  lastError: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: CalendarIntegrationProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.provider = props.provider;
    this.externalAccountId = props.externalAccountId;
    this.status = props.status;
    this.syncDirection = props.syncDirection;
    this.credentials = props.credentials;
    this.providerData = props.providerData;
    this.lastError = props.lastError;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: CalendarIntegrationProps): CalendarIntegration {
    return new CalendarIntegration(props);
  }

  belongsTo(userId: string): boolean {
    return this.userId === userId;
  }

  get isBidirectional(): boolean {
    return this.syncDirection === "bidirectional";
  }

  accessTokenExpired(now: Date): boolean {
    const { expiresAt } = this.credentials;
    if (!expiresAt) return true;
    return now.getTime() >= expiresAt - REFRESH_SKEW_MS;
  }
}
