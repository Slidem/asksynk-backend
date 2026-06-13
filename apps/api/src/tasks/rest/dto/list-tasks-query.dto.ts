import { IsIn, IsOptional, IsString } from "class-validator";

import { IsUuidV7 } from "@/api/common/decorators/validators";
import { TaskListScope, TaskStatus } from "@/api/tasks/models/task.model";

export class ListTasksQueryDto {
  @IsIn(["created_by_me", "assigned_to_me"])
  scope!: TaskListScope;

  @IsOptional()
  @IsIn(["todo", "in_progress", "completed"])
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
