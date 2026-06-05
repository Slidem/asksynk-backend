import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

import {
  TimerSessionType,
  TimerTransitionStatus,
} from "@/api/timers/models/timer.model";

export class PatchTimerDto {
  @IsIn(["running", "paused", "stopped"])
  status!: TimerTransitionStatus;

  @IsOptional()
  @IsIn(["focus", "short_break", "long_break"])
  sessionType?: TimerSessionType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86400)
  durationSeconds?: number;
}
