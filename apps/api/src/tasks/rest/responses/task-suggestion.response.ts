import { ApiProperty } from "@nestjs/swagger";

import {
  TASK_STATUSES,
  TASK_SUGGESTION_KINDS,
  TASK_SUGGESTION_STATUSES,
  TaskStatus,
  TaskSuggestionKind,
  TaskSuggestionStatus,
} from "@/api/tasks/models/task.model";

export class MaterializedTask {
  id!: string;
  title!: string;

  @ApiProperty({ enum: [...TASK_STATUSES], enumName: "TaskStatus" })
  status!: TaskStatus;
}

export class SuggestedTaskResponse {
  title!: string;
  description!: string | null;
}

export class TaskSuggestionPayloadResponse {
  @ApiProperty({
    enum: [...TASK_SUGGESTION_KINDS],
    enumName: "TaskSuggestionKind",
  })
  kind!: TaskSuggestionKind;

  title!: string;
  description!: string | null;
  dueDate!: string | null;
  tagIds!: string[];
  tasks!: SuggestedTaskResponse[];
}

export class TaskSuggestionResponse {
  id!: string;
  suggesterUserId!: string;
  suggesteeUserId!: string;

  @ApiProperty({
    enum: [...TASK_SUGGESTION_STATUSES],
    enumName: "TaskSuggestionStatus",
  })
  status!: TaskSuggestionStatus;

  payload!: TaskSuggestionPayloadResponse;

  /**
   * The real tasks created on accept. Populated on GET :id + the suggestion
   * broadcast; empty elsewhere (and while pending/rejected).
   */
  materializedTasks!: MaterializedTask[];

  createdAt!: string;
  updatedAt!: string;
}
