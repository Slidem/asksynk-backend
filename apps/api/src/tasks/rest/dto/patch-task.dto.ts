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
import { TaskStatus } from "@/api/tasks/models/task.model";

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

  @IsOptional()
  @IsIn(["todo", "in_progress", "completed"])
  status?: TaskStatus;

  @IsOptional()
  @IsArray()
  @IsUuidV7({ each: true })
  tagIds?: string[];
}
