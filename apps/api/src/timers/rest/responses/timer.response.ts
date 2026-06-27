import { ApiProperty } from "@nestjs/swagger";

import {
  TIMER_SESSION_TYPES,
  TIMER_STATUSES,
  TimerSessionType,
  TimerStatus,
} from "@/api/timers/models/timer.model";

export class TimerResponse {
  id!: string;
  userId!: string;

  @ApiProperty({ enum: [...TIMER_STATUSES], enumName: "TimerStatus" })
  status!: TimerStatus;

  @ApiProperty({
    enum: [...TIMER_SESSION_TYPES],
    enumName: "TimerSessionType",
    nullable: true,
  })
  sessionType!: TimerSessionType | null;

  sessionDurationSeconds!: number | null;
  remainingSeconds!: number | null;
  completesAt!: string | null;
  completedFocusSessions!: number;
  transitionedAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
}
