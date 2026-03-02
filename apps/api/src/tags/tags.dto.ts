import { Tag } from "@/api/tags/tag.entity";

export interface TagResponseDto {
  id: string;
  name: string;
  userId: string;
  description?: string;
  color: string;
  answerMode: "timeblock" | "immediately";
  responseTimeMillis: number;
  notificationsSettings: {
    browserNotificationEnabled: boolean;
    soundNotificationEnabled: boolean;
  };
}

export function toTagResponseDto(tag: Tag): TagResponseDto {
  return {
    id: tag.id,
    name: tag.name,
    userId: tag.userId,
    description: tag.description,
    color: tag.color,
    answerMode: tag.answerMode,
    responseTimeMillis: tag.responseTimeMillis,
    notificationsSettings: {
      browserNotificationEnabled: tag.notificationsSettings.browserNotificationEnabled,
      soundNotificationEnabled: tag.notificationsSettings.soundNotificationEnabled,
    },
  };
}
