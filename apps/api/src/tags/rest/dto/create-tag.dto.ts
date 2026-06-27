import { ApiProperty } from "@nestjs/swagger";
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
import {
  ANSWER_MODE_TYPES,
  AnswerMode,
  AnswerModeType,
} from "@/api/tags/models/tag.model";

export class NotificationsSettingsDto {
  @IsBoolean()
  browserNotificationEnabled!: boolean;

  @IsBoolean()
  soundNotificationEnabled!: boolean;
}

export class AnswerModeDto {
  @ApiProperty({ enum: [...ANSWER_MODE_TYPES], enumName: "AnswerModeType" })
  @IsIn(ANSWER_MODE_TYPES)
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
