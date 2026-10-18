import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import {
  TIMER_COMMANDS,
  TIMER_MODES,
  TIMER_STATUSES,
  TimerCommand,
  TimerMode,
  TimerStatus,
} from "@/api/focus/domain/timer.model";

export class FocusSessionSettingsResponse {
  focusDurationSeconds!: number;
  shortBreakDurationSeconds!: number;
  longBreakDurationSeconds!: number;
  longBreakInterval!: number;
}

export class FocusSessionResponse {
  id!: string;
  startedAt!: string;
  completedFocusBlocks!: number;
  shortBreaks!: number;
  longBreaks!: number;
  settings!: FocusSessionSettingsResponse;
}

export class AllowedCommandResponse {
  @ApiProperty({ enum: [...TIMER_COMMANDS], enumName: "TimerCommand" })
  command!: TimerCommand;

  /** Modes `start` accepts from the current state. */
  @ApiPropertyOptional({
    enum: [...TIMER_MODES],
    enumName: "TimerMode",
    isArray: true,
  })
  modes?: TimerMode[];
}

export class TimerResponse {
  id!: string;
  userId!: string;

  @ApiProperty({ enum: [...TIMER_STATUSES], enumName: "TimerStatus" })
  status!: TimerStatus;

  @ApiProperty({ enum: [...TIMER_MODES], enumName: "TimerMode", nullable: true })
  mode!: TimerMode | null;

  @ApiProperty({ type: Number, nullable: true })
  blockDurationSeconds!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  remainingSeconds!: number | null;

  @ApiProperty({ type: String, nullable: true })
  completesAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  transitionedAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastActivityAt!: string | null;

  @ApiProperty({ enum: [...TIMER_MODES], enumName: "TimerMode" })
  suggestedNextMode!: TimerMode;

  allowedCommands!: AllowedCommandResponse[];

  @ApiProperty({ type: Number, nullable: true })
  focusBlocksUntilLongBreak!: number | null;

  @ApiProperty({ type: FocusSessionResponse, nullable: true })
  session!: FocusSessionResponse | null;

  createdAt!: string;
  updatedAt!: string;
}
