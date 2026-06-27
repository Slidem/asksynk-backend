import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

import {
  IsIsoDateWithOffset,
  IsUuidV7,
} from "@/api/common/decorators/validators";

export class BatchTaskItemDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateTaskBatchRequestDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  /** Batch-level due date. ISO 8601 with offset. */
  @IsOptional()
  @IsIsoDateWithOffset()
  dueDate?: string;

  @IsOptional()
  @IsArray()
  @IsUuidV7({ each: true })
  tagIds?: string[];

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BatchTaskItemDto)
  tasks!: BatchTaskItemDto[];
}
