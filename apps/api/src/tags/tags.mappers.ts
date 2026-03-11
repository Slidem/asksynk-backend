import { Tag } from "@/api/tags/tag.entity";
import { TagResponseDto } from "@/api/tags/tags.rest-dto";

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
