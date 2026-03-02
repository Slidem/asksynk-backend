import { AnswerMode, NotificationsSettings } from "./tags.model";

interface TagInput {
  name: string;
  description?: string;
  color?: string;
  notificationsSettings?: NotificationsSettings;
  answerMode: AnswerMode;
}

type ImmediateTagInput = TagInput & {
  answerMode: "immediately";
};

type TimeblockTagInput = TagInput & {
  answerMode: "timeblock";
  responseTimeMillis: number;
};

export type CreateTagInput = {
  userId: string;
} & (ImmediateTagInput | TimeblockTagInput);

export type UpdateTagInput = {
  userId: string;
  tagId: string;
} & Partial<ImmediateTagInput | TimeblockTagInput>;
