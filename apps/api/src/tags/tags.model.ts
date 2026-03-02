export type ImmediateAnswerMode = {
  type: "immediately";
  responseTimeMillis: number;
};

export type TimeblockAnswerMode = {
  type: "timeblock";
};

export type AnswerMode = ImmediateAnswerMode | TimeblockAnswerMode;

export type AnswerModeType = AnswerMode["type"];

export type TagOrderBy = "createdAt" | "updatedAt";

export type TagOrderDirection = "asc" | "desc";

export interface NotificationsSettings {
  browserNotificationEnabled: boolean;
  soundNotificationEnabled: boolean;
}

export interface CreateTagInput {
  userId: string;
  name: string;
  description?: string;
  color?: string;
  answerMode?: AnswerMode;
  notificationsSettings?: NotificationsSettings;
}

export interface UpdateTagInput {
  userId: string;
  tagId: string;
  name?: string;
  description?: string;
  color?: string;
  answerMode?: AnswerMode;
  notificationsSettings?: NotificationsSettings;
}

export interface ListTagsInput {
  answerMode?: AnswerModeType;
  orderBy?: TagOrderBy;
  orderDirection?: TagOrderDirection;
  search?: string;
  limit?: number;
  offset?: number;
}
