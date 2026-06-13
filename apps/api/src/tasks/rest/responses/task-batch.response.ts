import { TaskResponse } from "@/api/tasks/rest/responses/task.response";

export interface TaskBatchResponse {
  id: string;
  createdBy: string;
  assigneeUserId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  tagIds: string[];
  tasks: TaskResponse[];
  createdAt: string;
  updatedAt: string;
}
