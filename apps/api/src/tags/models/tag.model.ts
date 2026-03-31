export type ImmediateAnswerMode = {
  type: "immediately";
  responseTimeMillis: number;
};

export type TimeblockAnswerMode = {
  type: "timeblock";
};

export type AnswerMode = ImmediateAnswerMode | TimeblockAnswerMode;

export type AnswerModeType = AnswerMode["type"];

export interface NotificationsSettings {
  browserNotificationEnabled: boolean;
  soundNotificationEnabled: boolean;
}
