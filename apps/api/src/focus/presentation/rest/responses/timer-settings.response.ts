import { ApiProperty } from "@nestjs/swagger";

export class TimerSettingsResponse {
  focusDurationSeconds!: number;
  shortBreakDurationSeconds!: number;
  longBreakDurationSeconds!: number;
  longBreakInterval!: number;

  @ApiProperty({ type: Number, nullable: true })
  inactivityTimeoutSeconds!: number | null;
}
