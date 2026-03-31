import { AnswerMode } from "@/api/tags/models/tag.model";

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
