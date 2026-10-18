import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import {
  TIMER_COMMANDS,
  TIMER_MODES,
  TIMER_STATUSES,
  TIMER_TRIGGERS,
  TimerCommand,
  TimerMode,
  TimerStatus,
  TimerTrigger,
} from "@/api/focus/domain/timer.model";

/** Exactly one of `command` / `trigger` is set. */
export class TimerTransitionOnResponse {
  @ApiPropertyOptional({ enum: [...TIMER_COMMANDS], enumName: "TimerCommand" })
  command?: TimerCommand;

  /** For `start`: the modes it accepts. */
  @ApiPropertyOptional({
    enum: [...TIMER_MODES],
    enumName: "TimerMode",
    isArray: true,
  })
  modes?: TimerMode[];

  @ApiPropertyOptional({ enum: [...TIMER_TRIGGERS], enumName: "TimerTrigger" })
  trigger?: TimerTrigger;
}

export class TimerTransitionResponse {
  @ApiProperty({ enum: [...TIMER_STATUSES], enumName: "TimerStatus" })
  from!: TimerStatus;

  /** Omitted = matches with or without a session. */
  @ApiPropertyOptional({ enum: ["none", "attached"] })
  session?: "none" | "attached";

  /** Current block's mode; omitted = any. */
  @ApiPropertyOptional({
    enum: [...TIMER_MODES],
    enumName: "TimerMode",
    isArray: true,
  })
  fromModes?: TimerMode[];

  on!: TimerTransitionOnResponse;

  @ApiProperty({ enum: [...TIMER_STATUSES], enumName: "TimerStatus" })
  to!: TimerStatus;

  @ApiProperty({ enum: ["create", "keep", "end"] })
  sessionEffect!: "create" | "keep" | "end";

  @ApiProperty({ enum: ["start", "skip", "abandon", "complete", "none"] })
  blockEffect!: "start" | "skip" | "abandon" | "complete" | "none";

  /** Accepted but changes nothing (e.g. reset without a session). */
  noop?: boolean;
}

export class TimerTransitionsResponse {
  @ApiProperty({ enum: [...TIMER_STATUSES], enumName: "TimerStatus", isArray: true })
  statuses!: TimerStatus[];

  @ApiProperty({ enum: [...TIMER_MODES], enumName: "TimerMode", isArray: true })
  modes!: TimerMode[];

  @ApiProperty({ enum: [...TIMER_COMMANDS], enumName: "TimerCommand", isArray: true })
  commands!: TimerCommand[];

  @ApiProperty({ enum: [...TIMER_TRIGGERS], enumName: "TimerTrigger", isArray: true })
  triggers!: TimerTrigger[];

  /** Triggers the server applies, in this order, before every command. */
  @ApiProperty({ enum: [...TIMER_TRIGGERS], enumName: "TimerTrigger", isArray: true })
  triggerOrder!: TimerTrigger[];

  transitions!: TimerTransitionResponse[];
}
