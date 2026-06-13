import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

import {
  IsIsoDateWithOffset,
  IsUuidV7,
} from "@/api/common/decorators/validators";

export class SuggestedTaskItemDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class TaskSuggestionPayloadDto {
  @IsIn(["task", "batch"])
  kind!: "task" | "batch";

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** Task due date (kind="task") or batch-level due date (kind="batch"). */
  @IsOptional()
  @IsIsoDateWithOffset()
  dueDate?: string;

  /** The suggestee's tag ids (task-level for kind="task", batch-level for kind="batch"). */
  @IsOptional()
  @IsArray()
  @IsUuidV7({ each: true })
  tagIds?: string[];

  /** For kind="batch" only. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SuggestedTaskItemDto)
  tasks?: SuggestedTaskItemDto[];
}

export class CreateTaskSuggestionRequestDto {
  @IsString()
  @IsNotEmpty()
  suggesteeUserId!: string;

  @ValidateNested()
  @Type(() => TaskSuggestionPayloadDto)
  payload!: TaskSuggestionPayloadDto;
}
