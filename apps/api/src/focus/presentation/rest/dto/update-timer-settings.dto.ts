import { ApiProperty } from "@nestjs/swagger";
import { IsInt, Max, Min, ValidateIf } from "class-validator";

export class UpdateTimerSettingsDto {
  @IsInt()
  @Min(1)
  @Max(86400)
  focusDurationSeconds!: number;

  @IsInt()
  @Min(1)
  @Max(86400)
  shortBreakDurationSeconds!: number;

  @IsInt()
  @Min(1)
  @Max(86400)
  longBreakDurationSeconds!: number;

  @IsInt()
  @Min(1)
  @Max(50)
  longBreakInterval!: number;

  /** Idle time after which the open session resets; `null` disables it. */
  @ApiProperty({ type: Number, nullable: true, minimum: 3600, maximum: 86400 })
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(3600)
  @Max(86400)
  inactivityTimeoutSeconds!: number | null;
}
