import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";

import { IsUuidV7 } from "@/api/common/decorators/validators";
import {
  TASK_LIST_SCOPES,
  TASK_STATUSES,
  TaskListScope,
  TaskStatus,
} from "@/api/tasks/models/task.model";

export class ListTasksQueryDto {
  @ApiProperty({ enum: [...TASK_LIST_SCOPES], enumName: "TaskListScope" })
  @IsIn(TASK_LIST_SCOPES)
  scope!: TaskListScope;

  @ApiPropertyOptional({ enum: [...TASK_STATUSES], enumName: "TaskStatus" })
  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: TaskStatus;

  @IsOptional()
  @IsUuidV7()
  batchId?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
