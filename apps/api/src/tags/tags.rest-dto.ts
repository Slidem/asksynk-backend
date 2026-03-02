import { AnswerMode, TagOrderBy, TagOrderDirection } from "./tags.model";

import { NotificationsSettings } from "./tags.model";

export interface TagRequestDto {
  name: string;
  description?: string;
  color?: string;
  answerMode?: AnswerMode;
  responseTimeMillis: number;
  notificationsSettings?: NotificationsSettings;
}

export type CreateTagRequestDto = TagRequestDto;

export type UpdateTagRequestDto = Partial<TagRequestDto>;

export interface ListTagsQueryDto {
  answerMode?: AnswerMode;
  orderBy?: TagOrderBy;
  orderDirection?: TagOrderDirection;
  search?: string;
  limit?: string;
  offset?: string;
}
