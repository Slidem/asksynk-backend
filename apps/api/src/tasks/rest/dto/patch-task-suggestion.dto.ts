import { ApiPropertyOptional } from "@nestjs/swagger";
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
import { SuggestedTaskItemDto } from "@/api/tasks/rest/dto/create-task-suggestion.dto";

// Either a lifecycle transition (status) OR a payload edit — never both. The
// controller rejects a mixed request with 400.
export class PatchTaskSuggestionRequestDto {
  @ApiPropertyOptional({
    enum: ["accepted", "rejected"],
    enumName: "TaskSuggestionResolution",
  })
  @IsOptional()
  @IsIn(["accepted", "rejected"])
  status?: "accepted" | "rejected";

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  /** Task due date (kind="task") or batch-level due date (kind="batch"), or null to clear. */
  @IsOptional()
  @IsIsoDateWithOffset()
  dueDate?: string | null;

  /** The suggestee's tag ids. */
  @IsOptional()
  @IsArray()
  @IsUuidV7({ each: true })
  tagIds?: string[];

  /** For batch suggestions only. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SuggestedTaskItemDto)
  tasks?: SuggestedTaskItemDto[];
}
