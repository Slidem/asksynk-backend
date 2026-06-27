import { TaskResponse } from "@/api/tasks/rest/responses/task.response";

export class TaskBatchResponse {
  id!: string;
  createdBy!: string;
  assigneeUserId!: string;
  title!: string;
  dueDate!: string | null;
  tagIds!: string[];
  tasks!: TaskResponse[];
  createdAt!: string;
  updatedAt!: string;
}
