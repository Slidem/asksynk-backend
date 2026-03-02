import { AnswerMode, TagOrderBy, TagOrderDirection } from "./tags.model";

export type AnswerMode = "timeblock" | "immediately";

export type TagOrderBy = "createdAt" | "updatedAt";

export type TagOrderDirection = "asc" | "desc";

export interface NotificationsSettings {
  browserNotificationEnabled: boolean;
  soundNotificationEnabled: boolean;
}
export interface ListTagsInput {
  answerMode?: AnswerMode;
  orderBy?: TagOrderBy;
  orderDirection?: TagOrderDirection;
  search?: string;
  limit?: number;
  offset?: number;
}
