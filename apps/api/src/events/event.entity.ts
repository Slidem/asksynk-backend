import { Recurrence } from "./recurrence.entity";

export interface TagSummary {
  id: string;
  name: string;
}

export interface EventProps {
  id: string;
  userId: string;
  name: string;
  start: Date;
  end: Date;
  recurrence: Recurrence | null;
  tags: TagSummary[];
  createdAt: Date;
  updatedAt: Date;
}

export class Event {
  readonly id: string;
  readonly userId: string;
  name: string;
  start: Date;
  end: Date;
  recurrence: Recurrence | null;
  tags: TagSummary[];
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: EventProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.name = props.name;
    this.start = props.start;
    this.end = props.end;
    this.recurrence = props.recurrence;
    this.tags = props.tags;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: EventProps): Event {
    return new Event(props);
  }

  setTags(tags: TagSummary[]): void {
    this.tags = [...tags];
  }

  belongsTo(userId: string): boolean {
    return this.userId === userId;
  }

  isRecurring(): boolean {
    return this.recurrence !== undefined;
  }
}
