import {
  EventOrderBy,
  EventOrderDirection,
  RecurrenceType,
} from "@/api/events/events.model";

export interface CreateEventRequestDto {
  name: string;
  start: string;
  end: string;
  tagIds?: string[];
}

export interface CreateRecurringEventsRequestDto {
  name: string;
  recurrenceType: RecurrenceType;
  start: string;
  end: string;
  until?: string;
  tagIds?: string[];
}

export interface UpdateEventRequestDto {
  name?: string;
  start?: string;
  end?: string;
  removeRecurrence?: boolean;
}

export interface UpdateRecurrenceEventsRequestDto {
  name?: string;
  start?: string;
  end?: string;
}

export interface ListEventsQueryDto {
  startDate?: string;
  endDate?: string;
  tagIds?: string;
  hasRecurrence?: string;
  orderBy?: EventOrderBy;
  orderDirection?: EventOrderDirection;
  limit?: string;
  offset?: string;
}

export interface TagSummaryDto {
  id: string;
  name: string;
}

export interface EventResponseDto {
  id: string;
  name: string;
  start: string;
  end: string;
  recurrenceId?: string;
  tags: TagSummaryDto[];
  createdAt: string;
  updatedAt: string;
}

export interface RecurrenceResponseDto {
  id: string;
  type: RecurrenceType;
  until: string;
  createdAt: string;
}

export interface RecurrenceWithEventsResponseDto {
  recurrence: RecurrenceResponseDto;
  events: EventResponseDto[];
}
