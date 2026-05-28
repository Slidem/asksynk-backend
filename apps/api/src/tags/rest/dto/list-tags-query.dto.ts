import { IsIn, IsNumberString, IsOptional, IsString } from "class-validator";

import {
  TagOrderBy,
  TagOrderDirection,
} from "@/api/tags/models/list-tags.model";
import { AnswerModeType } from "@/api/tags/models/tag.model";

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

  @IsOptional()
  userId?: string;
}
