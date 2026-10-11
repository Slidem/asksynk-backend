import { AnswerMode, NotificationsSettings } from "@/api/tagging/domain/tag";

export interface UpdateTagInput {
  userId: string;
  tagId: string;
  name?: string;
  description?: string;
  color?: string;
  answerMode?: AnswerMode;
  notificationsSettings?: NotificationsSettings;
}
