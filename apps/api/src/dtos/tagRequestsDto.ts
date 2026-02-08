import { TagDto } from "@/api/dtos/tagDto";

export interface CreateTagRequestDto {
  userId: string; // TODO: will soon be taken from context
  name: string;
  description: string;
  color?: string;
  answerMode?: TagDto["answerMode"];
  responseTimeMillis?: number;
  notificationsSettings?: TagDto["notificationsSettings"];
}

export interface ListTagsByUserIdRequestDto {
  userId: string; // TODO: will soon be taken from context
}
