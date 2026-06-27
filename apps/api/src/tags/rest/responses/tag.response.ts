import { ApiProperty } from "@nestjs/swagger";

import { ANSWER_MODE_TYPES, AnswerModeType } from "@/api/tags/models/tag.model";

export class TagNotificationsSettingsDto {
  browserNotificationEnabled!: boolean;
  soundNotificationEnabled!: boolean;
}

export class TagAnswerModeDto {
  @ApiProperty({ enum: [...ANSWER_MODE_TYPES], enumName: "AnswerModeType" })
  type!: AnswerModeType;

  /** Only present when `type` is "immediately". */
  responseTimeMillis?: number;
}

export class TagResponseDto {
  id!: string;
  name!: string;
  userId!: string;
  description?: string;
  color!: string;
  answerMode!: TagAnswerModeDto;
  notificationsSettings!: TagNotificationsSettingsDto;
}
