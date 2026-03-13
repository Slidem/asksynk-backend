import {
  AnswerMode,
  AnswerModeType,
  TagOrderBy,
  TagOrderDirection,
} from "@/api/tags/tags.model";
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
  ValidationOptions,
  registerDecorator,
} from "class-validator";

import { Type } from "class-transformer";
import { isValidId } from "@/shared/id";

function IsUuidV7(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isUuidV7",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      target: (object as any).constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === "string" && isValidId(value);
        },
        defaultMessage(): string {
          return "$property must be a valid UUIDv7";
        },
      },
    });
  };
}

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

export class ListTagsQueryDto {
  @IsOptional()
  @IsIn(["immediately", "timeblock"])
  answerMode?: AnswerModeType;

  @IsOptional()
  @IsIn(["createdAt", "updatedAt"])
  orderBy?: TagOrderBy;

  @IsOptional()
  @IsIn(["asc", "desc"])
  orderDirection?: TagOrderDirection;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsNumberString()
  offset?: string;
}

export interface TagResponseDto {
  id: string;
  name: string;
  userId: string;
  description?: string;
  color: string;
  answerMode: AnswerMode;
  notificationsSettings: {
    browserNotificationEnabled: boolean;
    soundNotificationEnabled: boolean;
  };
}
