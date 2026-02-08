export interface TagDto {
  id: string;
  name: string;
  userId: string;
  description?: string;
  color: string;
  answerMode: "timeblock" | "immediately";
  responseTimeMillis: number;
  notificationsSettings: {
    browserNotificationEnabled: boolean;
    soundNotificationEnabled: boolean;
  };
}
