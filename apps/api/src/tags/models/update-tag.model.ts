import { AnswerMode, NotificationsSettings } from "@/api/tags/models/tag.model";

export interface UpdateTagInput {
  userId: string;
  tagId: string;
  name?: string;
  description?: string;
  color?: string;
  answerMode?: AnswerMode;
  notificationsSettings?: NotificationsSettings;
}
