import { Tag } from "@/api/tagging/domain/tag";
import { TagResponseDto } from "@/api/tagging/rest/responses/tag.response";

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
