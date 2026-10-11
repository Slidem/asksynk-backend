export interface UserTimerSettingsProps {
  id: string;
  userId: string;
  focusDurationSeconds: number;
  shortBreakDurationSeconds: number;
  longBreakDurationSeconds: number;
  longBreakInterval: number;
  createdAt: Date;
  updatedAt: Date;
}

export class UserTimerSettings {
  readonly id: string;
  readonly userId: string;
  readonly focusDurationSeconds: number;
  readonly shortBreakDurationSeconds: number;
  readonly longBreakDurationSeconds: number;
  readonly longBreakInterval: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: UserTimerSettingsProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.focusDurationSeconds = props.focusDurationSeconds;
    this.shortBreakDurationSeconds = props.shortBreakDurationSeconds;
    this.longBreakDurationSeconds = props.longBreakDurationSeconds;
    this.longBreakInterval = props.longBreakInterval;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: UserTimerSettingsProps): UserTimerSettings {
    return new UserTimerSettings(props);
  }
}
