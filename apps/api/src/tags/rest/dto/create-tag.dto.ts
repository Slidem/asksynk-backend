import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from "class-validator";

import { IsUuidV7 } from "@/api/common/decorators/validators";
import { AnswerMode, AnswerModeType } from "@/api/tags/models/tag.model";

export class NotificationsSettingsDto {
  @IsBoolean()
  browserNotificationEnabled!: boolean;

  @IsBoolean()
  soundNotificationEnabled!: boolean;
}

export class AnswerModeDto {
  @IsIn(["immediately", "timeblock"])
  type!: AnswerModeType;

  @ValidateIf((o: AnswerModeDto) => o.type === "immediately")
  @IsNumber()
  responseTimeMillis?: number;
}

export class CreateTagRequestDto {
  @IsUuidV7()
  id!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AnswerModeDto)
  answerMode?: AnswerMode;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationsSettingsDto)
  notificationsSettings?: NotificationsSettingsDto;
}
