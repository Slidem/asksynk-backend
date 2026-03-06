import { RecurrenceType } from "@/api/events/events.model";

export interface RecurrenceProps {
  id: string;
  userId: string;
  type: RecurrenceType;
  startTime: Date;
  durationMs: number;
  until: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class Recurrence {
  readonly id: string;
  readonly userId: string;
  readonly type: RecurrenceType;
  readonly startTime: Date;
  readonly durationMs: number;
  until: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: RecurrenceProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.type = props.type;
    this.startTime = props.startTime;
    this.durationMs = props.durationMs;
    this.until = props.until;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: RecurrenceProps): Recurrence {
    return new Recurrence(props);
  }

  belongsTo(userId: string): boolean {
    return this.userId === userId;
  }
}
