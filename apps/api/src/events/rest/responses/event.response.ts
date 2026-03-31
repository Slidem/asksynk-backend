export interface EventResponseDto {
  id: string;
  calendarId: string;
  title: string;
  description: string | null;
  location: string | null;
  link: string | null;
  start: string;
  end: string;
  durationSeconds: number;
  allDay: boolean;
  timezone: string;
  rrule: string | null;
  color: string | null;
  isRecurring: boolean;
  tagIds: string[];
}
