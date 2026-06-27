import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";

import {
  IsIsoDateWithOffset,
  IsUuidV7,
} from "@/api/common/decorators/validators";
import { TASK_STATUSES, TaskStatus } from "@/api/tasks/models/task.model";

export class PatchTaskRequestDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  /** ISO 8601 with offset, or null to clear the pinned due date. */
  @IsOptional()
  @IsIsoDateWithOffset()
  dueDate?: string | null;

  @ApiPropertyOptional({ enum: [...TASK_STATUSES], enumName: "TaskStatus" })
  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: TaskStatus;

  @IsOptional()
  @IsArray()
  @IsUuidV7({ each: true })
  tagIds?: string[];
}
