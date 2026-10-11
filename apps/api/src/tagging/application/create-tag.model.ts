import { AnswerMode, NotificationsSettings } from "@/api/tagging/domain/tag";

export interface CreateTagInput {
  id: string;
  userId: string;
  name: string;
  description?: string;
  color?: string;
  answerMode?: AnswerMode;
  notificationsSettings?: NotificationsSettings;
}
