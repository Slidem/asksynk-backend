export interface UserSettingsProps {
  id: string;
  userId: string;
  attentionItemNotifications: boolean;
  timerNotifications: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class UserSettings {
  readonly id: string;
  readonly userId: string;
  readonly attentionItemNotifications: boolean;
  readonly timerNotifications: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: UserSettingsProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.attentionItemNotifications = props.attentionItemNotifications;
    this.timerNotifications = props.timerNotifications;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: UserSettingsProps): UserSettings {
    return new UserSettings(props);
  }
}
