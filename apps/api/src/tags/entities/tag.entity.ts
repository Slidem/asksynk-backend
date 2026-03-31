import { UUID } from "uuidv7";

import { AnswerMode, NotificationsSettings } from "@/api/tags/models/tag.model";

export interface TagProps {
  id: UUID;
  userId: string;
  name: string;
  description?: string;
  color: string;
  answerMode: AnswerMode;
  notificationsSettings: NotificationsSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface DefaultTagSettings {
  color: string;
  answerMode: AnswerMode;
  notificationsSettings: NotificationsSettings;
}

export class Tag {
  readonly id: UUID;
  readonly userId: string;
  name: string;
  description?: string;
  color: string;
  answerMode: AnswerMode;
  notificationsSettings: NotificationsSettings;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: TagProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.name = props.name;
    this.description = props.description;
    this.color = props.color;
    this.answerMode = props.answerMode;
    this.notificationsSettings = props.notificationsSettings;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: TagProps): Tag {
    return new Tag(props);
  }

  static defaults(): DefaultTagSettings {
    return {
      color: "#6b7280",
      answerMode: { type: "immediately", responseTimeMillis: 0 },
      notificationsSettings: {
        browserNotificationEnabled: true,
        soundNotificationEnabled: true,
      },
    };
  }

  belongsTo(userId: string): boolean {
    return this.userId === userId;
  }
}
