import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";

import {
  IsIsoDateWithOffset,
  IsUuidV7,
} from "@/api/common/decorators/validators";

export class CreateTaskRequestDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** ISO 8601 with offset: "2026-03-15T10:00:00+02:00" */
  @IsOptional()
  @IsIsoDateWithOffset()
  dueDate?: string;

  @IsOptional()
  @IsArray()
  @IsUuidV7({ each: true })
  tagIds?: string[];

  @IsOptional()
  @IsUuidV7()
  batchId?: string;
}
