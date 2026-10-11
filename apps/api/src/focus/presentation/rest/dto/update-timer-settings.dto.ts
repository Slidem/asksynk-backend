import { IsInt, Max, Min } from "class-validator";

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
}
