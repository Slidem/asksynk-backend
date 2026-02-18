import { TagDto } from "@/api/dtos/tagDto";

export interface CreateTagRequestDto {
  name: string;
  description?: string;
  color?: string;
  answerMode?: TagDto["answerMode"];
  responseTimeMillis?: number;
  notificationsSettings?: TagDto["notificationsSettings"];
}

export interface CreateTagInput extends CreateTagRequestDto {
  userId: string;
}

export interface UpdateTagRequestDto {
  name?: string;
  description?: string;
  color?: string;
  answerMode?: TagDto["answerMode"];
  responseTimeMillis?: number;
  notificationsSettings?: TagDto["notificationsSettings"];
}

export interface UpdateTagInput extends UpdateTagRequestDto {
  userId: string;
  tagId: string;
}

export type TagOrderBy = "createdAt" | "updatedAt";

export type TagOrderDirection = "asc" | "desc";

export interface ListTagsQueryDto {
  answerMode?: TagDto["answerMode"];
  orderBy?: TagOrderBy;
  orderDirection?: TagOrderDirection;
  search?: string;
  limit?: string;
  offset?: string;
}

export interface ListTagsInput {
  answerMode?: TagDto["answerMode"];
  orderBy?: TagOrderBy;
  orderDirection?: TagOrderDirection;
  search?: string;
  limit?: number;
  offset?: number;
}
