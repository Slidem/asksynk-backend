import { AnswerMode, NotificationsSettings } from "@/api/tags/models/tag.model";

export interface CreateTagInput {
  id: string;
  userId: string;
  name: string;
  description?: string;
  color?: string;
  answerMode?: AnswerMode;
  notificationsSettings?: NotificationsSettings;
}
