import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";

import {
  TASK_SUGGESTION_STATUSES,
  TaskSuggestionStatus,
} from "@/api/tasks/models/task.model";

export const TASK_SUGGESTION_ROLES = ["sent", "received"] as const;
export type TaskSuggestionRole = (typeof TASK_SUGGESTION_ROLES)[number];

export class ListTaskSuggestionsQueryDto {
  @ApiProperty({
    enum: [...TASK_SUGGESTION_ROLES],
    enumName: "TaskSuggestionRole",
  })
  @IsIn(TASK_SUGGESTION_ROLES)
  role!: TaskSuggestionRole;

  @ApiPropertyOptional({
    enum: [...TASK_SUGGESTION_STATUSES],
    enumName: "TaskSuggestionStatus",
  })
  @IsOptional()
  @IsIn(TASK_SUGGESTION_STATUSES)
  status?: TaskSuggestionStatus;
}
