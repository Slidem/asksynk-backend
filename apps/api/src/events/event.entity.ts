export interface EventProps {
  id: string;
  userId: string;
  name: string;
  start: Date;
  end: Date;
  recurrenceId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class Event {
  readonly id: string;
  readonly userId: string;
  name: string;
  start: Date;
  end: Date;
  recurrenceId?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: EventProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.name = props.name;
    this.start = props.start;
    this.end = props.end;
    this.recurrenceId = props.recurrenceId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: EventProps): Event {
    return new Event(props);
  }

  belongsTo(userId: string): boolean {
    return this.userId === userId;
  }

  isRecurring(): boolean {
    return this.recurrenceId !== undefined;
  }
}
