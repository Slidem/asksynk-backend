import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsNumberString, IsOptional, IsString } from "class-validator";

import {
  TAG_ORDER_BYS,
  TAG_ORDER_DIRECTIONS,
  TagOrderBy,
  TagOrderDirection,
} from "@/api/tags/models/list-tags.model";
import {
  ANSWER_MODE_TYPES,
  AnswerModeType,
} from "@/api/tags/models/tag.model";

export class ListTagsQueryDto {
  @ApiPropertyOptional({
    enum: [...ANSWER_MODE_TYPES],
    enumName: "AnswerModeType",
  })
  @IsOptional()
  @IsIn(ANSWER_MODE_TYPES)
  answerMode?: AnswerModeType;

  @ApiPropertyOptional({ enum: [...TAG_ORDER_BYS], enumName: "TagOrderBy" })
  @IsOptional()
  @IsIn(TAG_ORDER_BYS)
  orderBy?: TagOrderBy;

  @ApiPropertyOptional({
    enum: [...TAG_ORDER_DIRECTIONS],
    enumName: "TagOrderDirection",
  })
  @IsOptional()
  @IsIn(TAG_ORDER_DIRECTIONS)
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

  @IsOptional()
  userId?: string;
}
