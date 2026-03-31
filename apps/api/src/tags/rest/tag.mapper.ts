import { Tag } from "@/api/tags/entities/tag.entity";
import { TagResponseDto } from "@/api/tags/rest/responses/tag.response";

export function toTagResponseDto(tag: Tag): TagResponseDto {
  return {
    id: tag.id.toString(),
    name: tag.name,
    userId: tag.userId,
    description: tag.description,
    color: tag.color,
    answerMode: tag.answerMode,
    notificationsSettings: {
      browserNotificationEnabled:
        tag.notificationsSettings.browserNotificationEnabled,
      soundNotificationEnabled:
        tag.notificationsSettings.soundNotificationEnabled,
    },
  };
}
