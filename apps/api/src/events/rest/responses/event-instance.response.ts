export interface EventInstanceResponseDto {
  eventId: string;
  title: string;
  description: string | null;
  location: string | null;
  link: string | null;
  instanceStart: string;
  instanceEnd: string;
  durationSeconds: number;
  allDay: boolean;
  timezone: string;
  color: string | null;
  tagIds: string[];
}
