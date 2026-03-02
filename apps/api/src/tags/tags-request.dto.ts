import { AnswerMode, NotificationsSettings } from "@/api/tags/tag.entity";

export interface CreateTagRequestDto {
  name: string;
  description?: string;
  color?: string;
  answerMode?: AnswerMode;
  responseTimeMillis?: number;
  notificationsSettings?: NotificationsSettings;
}

export interface CreateTagInput extends CreateTagRequestDto {
  userId: string;
}

export interface UpdateTagRequestDto {
  name?: string;
  description?: string;
  color?: string;
  answerMode?: AnswerMode;
  responseTimeMillis?: number;
  notificationsSettings?: NotificationsSettings;
}

export interface UpdateTagInput extends UpdateTagRequestDto {
  userId: string;
  tagId: string;
}

export type TagOrderBy = "createdAt" | "updatedAt";

export type TagOrderDirection = "asc" | "desc";

export interface ListTagsQueryDto {
  answerMode?: AnswerMode;
  orderBy?: TagOrderBy;
  orderDirection?: TagOrderDirection;
  search?: string;
  limit?: string;
  offset?: string;
}

export interface ListTagsInput {
  answerMode?: AnswerMode;
  orderBy?: TagOrderBy;
  orderDirection?: TagOrderDirection;
  search?: string;
  limit?: number;
  offset?: number;
}
