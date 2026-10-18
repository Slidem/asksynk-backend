import { TimerSettingsValues } from "@/api/focus/domain/timer.model";

export interface UserTimerSettingsProps extends TimerSettingsValues {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class UserTimerSettings implements TimerSettingsValues {
  readonly id: string;
  readonly userId: string;
  readonly focusDurationSeconds: number;
  readonly shortBreakDurationSeconds: number;
  readonly longBreakDurationSeconds: number;
  readonly longBreakInterval: number;
  readonly inactivityTimeoutSeconds: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: UserTimerSettingsProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.focusDurationSeconds = props.focusDurationSeconds;
    this.shortBreakDurationSeconds = props.shortBreakDurationSeconds;
    this.longBreakDurationSeconds = props.longBreakDurationSeconds;
    this.longBreakInterval = props.longBreakInterval;
    this.inactivityTimeoutSeconds = props.inactivityTimeoutSeconds;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: UserTimerSettingsProps): UserTimerSettings {
    return new UserTimerSettings(props);
  }
}
