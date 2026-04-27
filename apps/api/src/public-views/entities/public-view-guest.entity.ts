export interface PublicViewGuestProps {
  id: string;
  publicViewId: string;
  displayName: string;
  token: string;
  expiresAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
}

export class PublicViewGuest {
  readonly id: string;
  readonly publicViewId: string;
  readonly displayName: string;
  readonly token: string;
  readonly expiresAt: Date;
  readonly lastSeenAt: Date;
  readonly createdAt: Date;

  private constructor(props: PublicViewGuestProps) {
    this.id = props.id;
    this.publicViewId = props.publicViewId;
    this.displayName = props.displayName;
    this.token = props.token;
    this.expiresAt = props.expiresAt;
    this.lastSeenAt = props.lastSeenAt;
    this.createdAt = props.createdAt;
  }

  static create(props: PublicViewGuestProps): PublicViewGuest {
    return new PublicViewGuest(props);
  }
}
