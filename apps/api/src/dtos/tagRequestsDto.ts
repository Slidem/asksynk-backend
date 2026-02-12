import { TagDto } from "@/api/dtos/tagDto";

export interface CreateTagRequestDto {
  name: string;
  description: string;
  color?: string;
  answerMode?: TagDto["answerMode"];
  responseTimeMillis?: number;
  notificationsSettings?: TagDto["notificationsSettings"];
}

export interface CreateTagInput extends CreateTagRequestDto {
  userId: string;
}
