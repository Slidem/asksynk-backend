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
  recurrenceType?: RecurrenceType;
  until?: string;
}

export interface UpdateEventRequestDto {
  name?: string;
  start?: string;
  end?: string;
  tagIds?: string[];
  recurrenceType?: RecurrenceType;
  until?: string;
  recurrence?: null;
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

export interface RecurrenceDto {
  id: string;
  type: RecurrenceType;
}

export interface EventResponseDto {
  id: string;
  name: string;
  start: string;
  end: string;
  recurrence: RecurrenceDto | null;
  tags: TagSummaryDto[];
  createdAt: string;
  updatedAt: string;
}
