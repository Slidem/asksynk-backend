export interface PublicViewProps {
  id: string;
  ownerUserId: string;
  slug: string;
  name: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export class PublicView {
  readonly id: string;
  readonly ownerUserId: string;
  readonly slug: string;
  name: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  readonly createdAt: Date;

  private constructor(props: PublicViewProps) {
    this.id = props.id;
    this.ownerUserId = props.ownerUserId;
    this.slug = props.slug;
    this.name = props.name;
    this.expiresAt = props.expiresAt;
    this.revokedAt = props.revokedAt;
    this.createdAt = props.createdAt;
  }

  static create(props: PublicViewProps): PublicView {
    return new PublicView(props);
  }

  belongsTo(userId: string): boolean {
    return this.ownerUserId === userId;
  }

  isLive(now: Date = new Date()): boolean {
    return this.revokedAt === null && this.expiresAt > now;
  }
}
