import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

import {
  TIMER_SESSION_TYPES,
  TIMER_TRANSITION_STATUSES,
  TimerSessionType,
  TimerTransitionStatus,
} from "@/api/timers/models/timer.model";

export class PatchTimerDto {
  @ApiProperty({
    enum: [...TIMER_TRANSITION_STATUSES],
    enumName: "TimerTransitionStatus",
  })
  @IsIn(TIMER_TRANSITION_STATUSES)
  status!: TimerTransitionStatus;

  @ApiPropertyOptional({
    enum: [...TIMER_SESSION_TYPES],
    enumName: "TimerSessionType",
  })
  @IsOptional()
  @IsIn(TIMER_SESSION_TYPES)
  sessionType?: TimerSessionType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86400)
  durationSeconds?: number;
}
