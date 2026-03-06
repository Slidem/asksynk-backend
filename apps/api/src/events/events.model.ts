export type RecurrenceType =
  | "daily"
  | "weekdays"
  | "weekly"
  | "bi-weekly"
  | "monthly";

export type EventOrderBy = "start" | "createdAt";

export type EventOrderDirection = "asc" | "desc";

export interface CreateEventInput {
  userId: string;
  name: string;
  start: Date;
  end: Date;
  tagIds?: string[];
}

export interface UpdateEventInput {
  userId: string;
  eventId: string;
  name?: string;
  start?: Date;
  end?: Date;
  removeRecurrence?: boolean;
}

export interface ListEventsInput {
  startDate?: Date;
  endDate?: Date;
  tagIds?: string[];
  hasRecurrence?: boolean;
  orderBy?: EventOrderBy;
  orderDirection?: EventOrderDirection;
  limit?: number;
  offset?: number;
}

export interface CreateRecurringEventsInput {
  userId: string;
  name: string;
  recurrenceType: RecurrenceType;
  start: Date;
  end: Date;
  until?: Date;
  tagIds?: string[];
}

export interface UpdateRecurrenceEventsInput {
  userId: string;
  recurrenceId: string;
  name?: string;
  start?: Date;
  end?: Date;
}

export interface EventTagInput {
  userId: string;
  eventId: string;
  tagId: string;
}
