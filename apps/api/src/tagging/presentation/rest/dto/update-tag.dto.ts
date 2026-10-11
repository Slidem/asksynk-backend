import { Type } from "class-transformer";
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

import { AnswerMode } from "@/api/tagging/domain/tag";
import {
  AnswerModeDto,
  NotificationsSettingsDto,
} from "@/api/tagging/presentation/rest/dto/create-tag.dto";

export class UpdateTagRequestDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

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
