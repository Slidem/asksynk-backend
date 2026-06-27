export type ImmediateAnswerMode = {
  type: "immediately";
  responseTimeMillis: number;
};

export type TimeblockAnswerMode = {
  type: "timeblock";
};

export type AnswerMode = ImmediateAnswerMode | TimeblockAnswerMode;

export const ANSWER_MODE_TYPES = ["immediately", "timeblock"] as const;
export type AnswerModeType = (typeof ANSWER_MODE_TYPES)[number];

export interface NotificationsSettings {
  browserNotificationEnabled: boolean;
  soundNotificationEnabled: boolean;
}
