import { ApiProperty } from "@nestjs/swagger";

import { TASK_STATUSES, TaskStatus } from "@/api/tasks/models/task.model";

export class TaskResponse {
  id!: string;
  batchId!: string | null;
  createdBy!: string;
  assigneeUserId!: string;
  title!: string;
  description!: string | null;

  @ApiProperty({ enum: [...TASK_STATUSES], enumName: "TaskStatus" })
  status!: TaskStatus;

  dueDate!: string | null;
  tagIds!: string[];
  createdAt!: string;
  updatedAt!: string;
}
