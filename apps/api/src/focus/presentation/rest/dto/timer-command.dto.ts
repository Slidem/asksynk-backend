import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";

import {
  TIMER_COMMANDS,
  TIMER_MODES,
  TimerCommand,
  TimerMode,
} from "@/api/focus/domain/timer.model";

export class TimerCommandDto {
  @ApiProperty({ enum: [...TIMER_COMMANDS], enumName: "TimerCommand" })
  @IsIn(TIMER_COMMANDS)
  command!: TimerCommand;

  /** Required for `start`, rejected otherwise. Duration comes from settings. */
  @ApiPropertyOptional({ enum: [...TIMER_MODES], enumName: "TimerMode" })
  @IsOptional()
  @IsIn(TIMER_MODES)
  mode?: TimerMode;
}
