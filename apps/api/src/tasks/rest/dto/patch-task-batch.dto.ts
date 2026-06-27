import { IsArray, IsNotEmpty, IsOptional, IsString } from "class-validator";

import {
  IsIsoDateWithOffset,
  IsUuidV7,
} from "@/api/common/decorators/validators";

export class PatchTaskBatchRequestDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  /** Batch-level due date. ISO 8601 with offset, or null to clear. */
  @IsOptional()
  @IsIsoDateWithOffset()
  dueDate?: string | null;

  @IsOptional()
  @IsArray()
  @IsUuidV7({ each: true })
  tagIds?: string[];
}
