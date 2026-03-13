export interface CalendarProps {
  id: string;
  userId: string;
  source: string;
  color: string | null;
  externalId: string | null;
  createdAt: Date;
}

export class Calendar {
  readonly id: string;
  readonly userId: string;
  readonly source: string;
  color: string | null;
  externalId: string | null;
  readonly createdAt: Date;

  private constructor(props: CalendarProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.source = props.source;
    this.color = props.color;
    this.externalId = props.externalId;
    this.createdAt = props.createdAt;
  }

  static create(props: CalendarProps): Calendar {
    return new Calendar(props);
  }

  belongsTo(userId: string): boolean {
    return this.userId === userId;
  }
}
