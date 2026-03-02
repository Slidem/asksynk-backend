import {
  AnswerMode,
  AnswerModeType,
  NotificationsSettings,
  TagOrderBy,
  TagOrderDirection,
} from "@/api/tags/tags.model";

export interface CreateTagRequestDto {
  name: string;
  description?: string;
  color?: string;
  answerMode?: AnswerMode;
  notificationsSettings?: NotificationsSettings;
}

export type UpdateTagRequestDto = Partial<CreateTagRequestDto>;

export interface ListTagsQueryDto {
  answerMode?: AnswerModeType;
  orderBy?: TagOrderBy;
  orderDirection?: TagOrderDirection;
  search?: string;
  limit?: string;
  offset?: string;
}

export interface TagResponseDto {
  id: string;
  name: string;
  userId: string;
  description?: string;
  color: string;
  answerMode: AnswerMode;
  notificationsSettings: {
    browserNotificationEnabled: boolean;
    soundNotificationEnabled: boolean;
  };
}
